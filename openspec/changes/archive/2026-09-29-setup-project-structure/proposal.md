## Why

nomnom has tooling but no application code. Before the first feature (`add-core-data-model`) lands, the repository needs a structure that keeps business logic apart from the command line, plus written rules that the structure enforces. Doing it now means every later change follows one layout. Otherwise the layout would be retrofitted after logic has already leaked into the CLI.

## What Changes

- Turn the repository into a Bun workspace with `apps/*` and `packages/*`. Remove the placeholder `index.ts`.
- Add `packages/core` (`@nomnom/core`), the home of all business logic. It never reads argv or the environment, never prints and never exits. It exposes services created through dependency injection, and it exposes their interfaces as types.
- Add `apps/cli` (`@nomnom/cli`, bin `nomnom`), a thin wrapper around the core services. It handles argument parsing with `util.parseArgs` over `Bun.argv`, help text, output formatting and exit codes, and it is the composition root that wires the real services together.
- Add a declarative command definition. Each command is described by one object (name, summary, positionals, options, run), and both argument parsing and `--help` output are derived from that same object. The help can never drift from the arguments the command actually accepts.
- Add the first core building blocks that later features depend on:
  - a `FileSystem` port with a narrow, domain-shaped interface, a Bun adapter, and an in-memory mock
  - a `Clock` port with a system implementation and a fixed mock
  - a `NomnomError` type for user-fixable errors
  - a `createServices` composition function
- Establish testing conventions:
  - tests sit next to the source as `*.test.ts`
  - mocks live in `__mocks__/` folders
  - each package mocks only its direct dependencies: core mocks its ports, and the CLI writes its own mocks of the core services it uses and never imports core mocks
- Enforce the boundaries with Biome overrides:
  - core may not print or use `process`
  - only the adapters may touch `Bun` and `node:fs`
  - only the CLI entry point may touch the process
  - only tests may import mocks
- Add a `typecheck` script (`tsc --noEmit`), run it in the pre-commit hook, and add a `test` script. The type check is what keeps hand-written mocks in step with the service interfaces.
- Add rulesync rules for architecture, the CLI and testing, and update the README.

## Capabilities

### New Capabilities

- `cli`: how the `nomnom` command line behaves regardless of which commands exist. This covers:
  - global and per-command help derived from command definitions
  - command groups
  - usage errors for unknown commands, unknown options and missing arguments
  - reporting of errors from core, and exit codes

### Modified Capabilities

None. There are no existing specs.

## Impact

- **New layout:**
  - `apps/cli/`: `package.json` and `src/`
  - `packages/core/`: `package.json` and `src/`
  - root `package.json`: gains `workspaces`, `test`, `typecheck` and `nomnom` scripts, and loses `module: index.ts`
  - `tsconfig.json`: includes both workspaces
  - `biome.json`: overrides for the boundaries above
  - `.husky/pre-commit`: runs the type check
- **New rules:** `.rulesync/rules/architecture.md`, `cli.md` and `testing.md`. README updated.
- **No new runtime dependencies.** `typescript` is already installed and gets used as a dev tool.
- **Follow-up for `add-core-data-model`:** its design places code under `src/core/` and `src/commands/`, and its tasks 1.1 and 1.2 create `src/cli.ts`, the bin entry and `NomnomError`. That change must be revised after this one lands, so that its modules go into `packages/core/src/` and its commands into `apps/cli/src/commands/` as command definitions, using the ports, error type and runner introduced here.
