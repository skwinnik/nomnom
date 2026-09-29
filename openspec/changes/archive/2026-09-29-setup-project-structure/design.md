## Context

The repository is a single Bun package: a placeholder `index.ts`, one `tsconfig.json`, and a root `biome.json` with Biome 2.5. There is no type-check step; Bun strips types without checking them. `typescript` is installed as a peer dependency. The pending change `add-core-data-model` already separates core logic from CLI code inside one `src/` tree and has chosen `util.parseArgs` with option sets built from the config. This change makes that split physical and enforced before any logic exists. See `proposal.md` for motivation and `specs/cli/spec.md` for the command-line behaviour.

## Goals / Non-Goals

**Goals:**
- A workspace layout where the direction of dependencies (cli -> core) is enforced by package boundaries and lint rules, not by convention.
- One pattern for services (dependency injection through factories), for ports and adapters, and for tests and mocks, established with real code (`FileSystem`, `Clock`), so `add-core-data-model` only has to follow it.
- A command runner in which a command's definition is the only source of its accepted arguments and of its help.

**Non-Goals:**
- Any nomnom feature command or configuration loading. These arrive with `add-core-data-model`.
- Build, bundling, single-file executables (`bun build --compile`) or publishing packages.
- Shell completion, coloured output, localisation.
- Running tests in the pre-commit hook.

## Decisions

### Workspace layout

```
package.json          workspaces: ["apps/*", "packages/*"]; scripts: test, typecheck, nomnom, ...
tsconfig.json         one config for the whole repo; include: apps/*/src, packages/*/src
biome.json            one config, with per-area overrides (see "Enforced boundaries")
apps/cli/
  package.json        @nomnom/cli, private, bin: { nomnom: ./src/index.ts },
                      dependencies: { "@nomnom/core": "workspace:*" }
  src/
    index.ts          entry point and composition root (the only file allowed to touch the process)
    runner/           command definition types, dispatch, parsing, help rendering, error reporting
    commands/
      index.ts        the list of registered command definitions (empty in this change)
    __mocks__/        mocks of core services used by CLI tests
packages/core/
  package.json        @nomnom/core, private, exports: { ".": "./src/index.ts" }
  src/
    index.ts          public API: createServices, service and port interfaces, NomnomError, adapters
    errors.ts         NomnomError
    services.ts       Services type and createServices
    fs/               file-system.ts (port), bun-file-system.ts (adapter), __mocks__/file-system.ts
    clock/            clock.ts (port), system-clock.ts, __mocks__/clock.ts
```

Core exports TypeScript source directly (`exports` points at `src/index.ts`). Bun runs TypeScript natively, so there is no build step, and editors jump straight to the source. The only exported entry is `.`. Deep imports such as `@nomnom/core/src/...` fail to resolve, and mocks are never exported.

A single root `tsconfig.json` (instead of per-package configs with project references) is enough: nothing is emitted, and `tsc --noEmit` at the root checks both packages in one pass. Workspace packages resolve through Bun's `node_modules/@nomnom/*` links and the `exports` field under `moduleResolution: bundler`.

The root script `nomnom` (`bun apps/cli/src/index.ts`) runs the CLI during development. `bun link` inside `apps/cli` puts `nomnom` on the `PATH` for real use.

Alternatives: a single package with `src/core` and `src/cli` folders (the current plan in `add-core-data-model`). It is simpler, but nothing stops a core file from importing CLI code or printing, which is exactly what this change wants to prevent.

### Services: factory functions with injected dependencies

Every service is created by a factory that takes its dependencies as one object and returns an interface:

```ts
export interface FoodService { add(input: NewFood): Promise<FoodRecord> }
export function createFoodService(deps: { store: VersionedStore; clock: Clock }): FoodService
```

- Dependencies are interfaces (ports or other services), so each can be replaced by a mock in tests.
- Factories do no I/O. Creating the whole graph is cheap, so the CLI can build it on every run, even for `--help`.
- `createServices(deps: { fs: FileSystem; clock: Clock })` in core wires all services together and returns `Services`. It is the only place that knows how services depend on each other. `Services` is empty in this change; `add-core-data-model` adds its members.
- Runtime values that services need but that come from the process (the data directory from `NOMNOM_DIR`, the loaded config) are resolved by the CLI and passed in as plain values. Core never reads them itself.

Alternatives:
- A DI container (tsyringe, inversify). It needs decorators and `reflect-metadata` and hides the graph, and a handful of factories doesn't need it.
- Classes with constructor injection. They are equivalent. Factories returning interfaces keep the implementation private and match the functional style of the rest of the code.

### Ports and adapters

A port is an interface for something outside the process. An adapter is its real implementation. Adapters that use Bun or Node I/O APIs are named `bun-*.ts`. They are the only core files allowed to use those APIs, and they are tested against the real system (a temporary directory for the file system).

`FileSystem` is deliberately narrow and shaped by what the domain needs, not a mirror of `node:fs`:

| Method | Behaviour |
|---|---|
| `readText(path)` | File contents, or `undefined` when the file does not exist |
| `exists(path)` | Whether a file or directory exists |
| `list(dir)` | Entries `{ name, kind: "file" \| "directory" }` sorted by name; empty when the directory does not exist |
| `createExclusive(path, text)` | Creates parent directories and writes a new file; fails with `FileExistsError` if the file exists (exclusive create, `wx`) |
| `replaceAtomic(path, text)` | Creates parent directories, writes a temporary file in the same directory, then renames it over the target |

A narrow port keeps the in-memory mock small enough to be faithful: it only has to honour five operations, including the exclusive and atomic semantics that `add-core-data-model` relies on. A port mirroring `node:fs` would have to reproduce flags and edge cases it would get subtly wrong. The port grows only when a feature needs a new operation.

`Clock` has one method, `now(): Date`. Core code never calls `new Date()` or `Date.now()` for the current time; it asks the injected clock.

### Errors

`NomnomError` in core carries a message and an optional list of problems `{ file, line?, message }`. It marks errors that the user can fix. The CLI formats it as the spec's error reporting requires. Core never decides how an error is shown. Any other exception is treated as unexpected.

### Command definitions: one object for parsing and help

A command is a value created by `defineCommand`:

```ts
export const foodAdd = defineCommand({
  name: ["food", "add"],
  summary: "Add a food",
  positionals: [],                                  // { name, description, optional?, variadic? }[]
  options: (ctx) => ({                              // or a plain object when static
    name: { type: "string", required: true, description: "Display name" },
    barcode: { type: "string", multiple: true, valueName: "digits", description: "Barcode" },
    ...nutrientOptions(ctx.config),
  }),
  run: async ({ values, positionals }, { services, io }) => { ... },
});
```

- **Option specs.** An option spec extends `parseArgs`'s option config (`type`, `short`, `multiple`, `default`) with `description`, `required` and `valueName`. The runner maps the specs to a `parseArgs` config by keeping only the fields `parseArgs` knows, and renders help from the full specs. There is no second list anywhere, so the help cannot drift from what the parser accepts.
- **Typed values.** `values` in `run` is typed from the option specs: strings, booleans, and arrays for `multiple`, with non-optional types for `required` options.
- **Options that depend on runtime data.** `options` can be a function of a `CommandContext`. The entry point supplies a lazy `resolveContext()`. The runner calls it only when the selected command's options are a function, once per run, and uses the result for both parsing and help. Global usage only needs names and summaries, so `nomnom --help` never resolves the context. `CommandContext` is empty in this change; `add-core-data-model` adds the loaded config.
- **Services per command.** `defineCommand` is generic over the services a command uses. A command declares `Pick<Services, "foods">` and the runner passes the full `Services`. Tests pass only the mocked services that command needs.
- **Output streams.** Commands write through an injected `io: { stdout(text), stderr(text) }`. They never touch `console` or `process`.

Alternatives: a CLI framework (commander, citty, yargs). They generate help, but they add a dependency, and none of them handles option sets that depend on the config better than a small runner does. Hand-written help text per command was rejected because it drifts.

### Runner flow

```
argv (Bun.argv.slice(2))
  |
  v
1. resolve command path: take leading non-option tokens while they extend a known
   group or command name (longest match)
     no tokens                   -> global usage (stdout, 0)
     unknown first token         -> usage error "unknown command" (stderr, 1)
     group without subcommand    -> group list (stdout, 0 with -h/--help; stderr, 1 otherwise)
  |
  v
2. scan the remaining tokens up to "--" for -h/--help
     found -> resolve options, render command help (stdout, 0)
  |
  v
3. resolve options -> parseArgs({ args, options, strict: true, allowPositionals: true, tokens: true })
   then the checks parseArgs does not do: required options, positional count,
   a non-multiple option repeated (found through tokens, because parseArgs keeps the last value)
     failure -> usage error + "Run 'nomnom <command> --help'" (stderr, 1)
  |
  v
4. run(values, positionals, { services, io })
     NomnomError  -> message + one line per problem (stderr, 1)
     other error  -> stack trace (stderr, 1)
     success      -> 0
```

The runner returns the exit code instead of exiting. `index.ts` sets `process.exitCode = await runCli(...)`, so the whole runner is testable in-process. Errors that `parseArgs` throws are translated by their `code` (unknown option, missing value, value given to a flag, unexpected positional) into the runner's own messages, falling back to the original message for any code it does not know.

### Enforced boundaries (Biome overrides)

| Files | `console` | `process` | `Bun` global | `node:fs` | imports from `__mocks__` |
|---|---|---|---|---|---|
| `packages/core/src/**` | no | no | no | no | no |
| `packages/core/src/**/bun-*.ts` (adapters and their tests) | no | no | yes | yes | no |
| `apps/cli/src/**` except `index.ts` | no | no | no | no | no |
| `apps/cli/src/index.ts` | yes | yes | yes | no | no |
| `**/*.test.ts`, `**/__mocks__/**` | as for their area | as for their area | as for their area | as for their area | yes |

Other rules in the same overrides:
- Core may not import `@nomnom/cli`.
- The CLI may not reach into `packages/` by relative path.

The rules used are `suspicious/noConsole`, `style/noRestrictedGlobals` (`deniedGlobals`) and `style/noRestrictedImports` (`paths` for module names, `patterns` with a gitignore-style group for `**/__mocks__/**`). Their options were confirmed in the installed Biome 2.5 schema. Overrides are applied in order. Each more specific override restates the complete options of the rules it touches, because Biome is not assumed to merge options across overrides. A task verifies each row with deliberately violating files.

Some things lint cannot express: `Bun.argv` or `Bun.env` read through an allowed `Bun` global inside adapters, and `new Date()` used for the current time. These are covered by the written rules instead.

### Tests and mocks

- Tests sit next to the file they test as `<name>.test.ts`, and the root `bun test` finds them in every workspace.
- A mock lives in a `__mocks__/` folder next to the module it replaces (`fs/__mocks__/file-system.ts`). Bun does not load `__mocks__` automatically; with dependency injection a test just passes the mock in.
- Each package mocks only its direct dependencies. Core tests mock ports, or other services when testing one service in isolation. CLI tests mock the core services that a command uses, in `apps/cli/src/__mocks__/`, and never import core mocks: core does not export them, and the lint rule forbids reaching into them. CLI mocks are typed as the core service interfaces, so a change to an interface breaks the mock at type-check time.
- Most CLI tests call the runner in-process with mocked services and captured `io`. A few end-to-end tests spawn `bun apps/cli/src/index.ts` to prove that the entry point wiring works.

### Type checking

A root script `typecheck` runs `tsc --noEmit`, and `.husky/pre-commit` runs it after lint-staged. Bun never checks types, so without this step a hand-written mock that no longer matches its interface would pass silently.

### Written rules

The rules are split so each loads where it applies:
- `.rulesync/rules/architecture.md` (all files): layout, direction of dependencies, what core may and may not do, services and factories, ports and adapters, errors, and the table of enforced boundaries.
- `.rulesync/rules/cli.md` (globs `apps/cli/**`): thin commands, definitions as the only source of arguments and help, injected `io`, and the entry point as the only file that touches the process.
- `.rulesync/rules/testing.md` (globs `**/*.test.ts`, `**/__mocks__/**`): tests next to the source, `__mocks__`, mocking only direct dependencies, adapter tests against real temporary directories, and running `typecheck`.

The existing overview rule gets the new scripts.

## Risks / Trade-offs

- [Biome may not merge rule options across overrides the way the table assumes] → Each specific override restates complete options, and a task checks every boundary with fixture files that must fail and files that must pass.
- [`parseArgs` error codes or messages in Bun differ from Node's] → The runner maps known codes and falls back to the original message. Tests cover each usage error from the spec.
- [`parseArgs` silently keeps the last value of a repeated non-multiple option] → The runner detects repeats from `tokens` and reports a usage error.
- [Option values that start with `-` (for example a negative number) are read as options by `parseArgs`] → Such values need the `--opt=-5` form. The command help's footer mentions it.
- [Hand-written CLI mocks drift from core services] → Mocks are typed as core interfaces, and `typecheck` runs on every commit.
- [The type check slows down commits as the code grows] → It checks a small project now. It can move to CI or incremental mode (`tsBuildInfo`) later without changing any rule.
- [`add-core-data-model` still describes the old `src/` layout] → The proposal records the follow-up. That change is revised after this one lands, before its implementation starts.

## Open Questions

- Whether to also run `bun test` in the pre-commit hook once the test suite exists. This can be decided later without changing the structure.
