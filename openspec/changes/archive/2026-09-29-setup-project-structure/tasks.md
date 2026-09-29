## 1. Workspace

- [x] 1.1 Create `packages/core` (`@nomnom/core`, private, `exports: { ".": "./src/index.ts" }`) and `apps/cli` (`@nomnom/cli`, private, `bin: { nomnom: ./src/index.ts }`, dependency `"@nomnom/core": "workspace:*"`), each with a minimal `src/index.ts`. Add `workspaces: ["apps/*", "packages/*"]` to the root `package.json`, remove `module` and the placeholder `index.ts`, and run `bun install`. Verify `node_modules/@nomnom/core` links to `packages/core` and that `import {} from "@nomnom/core"` resolves from `apps/cli`
- [x] 1.2 Point the root `tsconfig.json` at `apps/*/src` and `packages/*/src`, and add the root scripts `typecheck` (`tsc --noEmit`), `test` (`bun test`) and `nomnom` (`bun apps/cli/src/index.ts`). Verify that `bun run typecheck` passes and that it fails on a deliberately wrong type in each package
- [x] 1.3 Run `bun run typecheck` in `.husky/pre-commit` after lint-staged. Verify a commit with a type error is rejected and a clean one passes

## 2. Core foundations

- [x] 2.1 Add `NomnomError` (message plus optional problems `{ file, line?, message }`) in `packages/core/src/errors.ts` and export it. Verify with `errors.test.ts` that it keeps its message and problems and is recognisable with `instanceof`
- [x] 2.2 Add the `Clock` port, `createSystemClock()` and the fixed mock `clock/__mocks__/clock.ts` (`createFixedClock(date)`, with a way to set the time). Verify with tests that the fixed clock returns the set time and the system clock returns the current time
- [x] 2.3 Add the `FileSystem` port (`readText`, `exists`, `list`, `createExclusive`, `replaceAtomic`) and `FileExistsError`, and the in-memory mock `fs/__mocks__/file-system.ts`. Verify with tests on the mock: `undefined` for a missing file, `FileExistsError` on a second `createExclusive`, parent directories implied, `list` sorted with kinds, and an empty list for a missing directory
- [x] 2.4 Add the adapter `fs/bun-file-system.ts`, using exclusive create (`wx`) and temp-file-plus-rename in the same directory. Verify `bun-file-system.test.ts` runs the same behaviour cases as 2.3 against a real temporary directory, and also checks that `replaceAtomic` leaves no temporary file behind and that `createExclusive` never overwrites an existing file
- [x] 2.5 Add `Services` (empty for now) and `createServices({ fs, clock })` in `services.ts`, and export the ports, adapters, `createServices`, `Services` and `NomnomError` from `src/index.ts`, but no mocks. Verify with `bun run typecheck` and a test that `createServices` builds without doing I/O (it succeeds with a mock file system that throws on every call)

## 3. CLI runner

- [x] 3.1 Add the command definition types and `defineCommand` in `apps/cli/src/runner/`: option specs extending `parseArgs` fields with `description`, `required` and `valueName`; positionals with `optional` and `variadic`; `options` as an object or a function of `CommandContext`; the services type per command; and `run` receiving typed values. Verify with type-level tests (`expectTypeOf` or `@ts-expect-error` checks) that `required` options are non-optional, `multiple` options are arrays and undeclared options are type errors
- [x] 3.2 Implement dispatch: resolve the longest command path from leading non-option tokens, print global usage (no arguments, `-h`, `--help`), list a group's subcommands (stdout and 0 with help, stderr and 1 without), and report an unknown command. Verify with in-process runner tests using test-only command definitions and captured `io` for every scenario under "Global usage", "Command groups" and "Unknown command" in `specs/cli/spec.md`
- [x] 3.3 Implement command help rendered from the resolved definition: summary; usage line with the full name, positionals marked optional or repeatable, and `[options]`; options with short alias, value placeholder, description and required, repeatable and default markers; and a footer about the `--opt=-value` form. Help takes precedence over other errors, is ignored after `--`, and `resolveContext` is called only for function options and only once. Verify with tests for every "Command help" scenario and the "Runtime-dependent options appear in help" scenario
- [x] 3.4 Implement parsing through `parseArgs` (`strict`, `allowPositionals`, `tokens`) with options derived from the same specs, translating `parseArgs` error codes, and add the checks for required options, positional count and repeated non-multiple options. Every usage error ends with a hint to run the relevant `--help` and exits with status 1. Verify with tests for every "Usage errors" scenario and the "Declared option is documented and accepted" and "Undeclared option is neither documented nor accepted" scenarios
- [x] 3.5 Implement error reporting around `run`: `NomnomError` prints its message and one `file:line: message` line per problem without a stack trace, other errors print their stack trace, both exit 1, and success exits 0. Verify with tests for every "Error reporting and exit codes" scenario

## 4. CLI entry point

- [x] 4.1 Write `apps/cli/src/index.ts` with a `#!/usr/bin/env bun` shebang. It builds `createServices` with `createBunFileSystem()` and `createSystemClock()`, passes the (empty) command list from `commands/index.ts`, `io` writing to `process.stdout` and `process.stderr`, and `Bun.argv.slice(2)` to the runner, then sets `process.exitCode`. Verify with end-to-end tests spawning `bun apps/cli/src/index.ts` that `--help` exits 0 with usage on stdout and `frobnicate` exits 1 with the error on stderr, and that `bun run nomnom --help` works
- [x] 4.2 Add the first CLI mock pattern: `apps/cli/src/__mocks__/` with a README-style header comment in its first mock stating the convention (typed as the core interface, mock only what the command uses). Since `Services` is still empty, add a runner test that injects a mocked service through a test-only command to prove the per-command services typing. Verify the test passes and that the mock fails `typecheck` when its shape doesn't match the interface

## 5. Enforced boundaries

- [x] 5.1 Add Biome overrides implementing the boundary table in `design.md` (core: no `console`, `process`, `Bun`, `node:fs`, `@nomnom/cli`; `bun-*.ts` adapters: `Bun` and `node:fs` allowed; CLI outside `index.ts`: no `console`, `process`, `Bun`, `node:fs`, and no relative imports into `packages/`; `__mocks__` imports only from `*.test.ts` and `__mocks__/`), with each specific override restating complete rule options. Verify with temporary fixture files that each forbidden case fails `bun run check` and each allowed case passes, then delete the fixtures
- [x] 5.2 Confirm that the CLI can't import core mocks: `import ... from "@nomnom/core/src/fs/__mocks__/file-system"` fails to resolve (`typecheck`), and a relative path into `packages/` is rejected by `bun run check`

## 6. Rules and docs

- [x] 6.1 Write `.rulesync/rules/architecture.md`, `.rulesync/rules/cli.md` (globs `apps/cli/**`) and `.rulesync/rules/testing.md` (globs `**/*.test.ts`, `**/__mocks__/**`) as described in `design.md`, and add the new scripts to `overview.md`. Run `bun run rules:generate` and verify that the generated `CLAUDE.md`, `AGENTS.md` and `.claude/rules/` contain the new rules
- [x] 6.2 Update the README: setup (`bun install`, `bun run nomnom --help`, `bun link` in `apps/cli`), the workspace layout, and the scripts table (`test`, `typecheck`, `nomnom`). Verify every documented command runs as described

## 7. Wrap-up

- [x] 7.1 Run `bun install`, `bun test`, `bun run typecheck` and `bun run check` from a clean state, and verify all pass
