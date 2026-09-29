---
root: false
targets: ["*"]
description: "Architecture: workspace layout, core and CLI boundaries, services, ports and adapters"
globs: ["**/*"]
---

# Architecture

## Layout

nomnom is a Bun workspace. Dependencies point one way only: `apps/cli` -> `packages/core`.

```
apps/cli/            @nomnom/cli, the `nomnom` command (a thin wrapper around core)
  src/index.ts       entry point and composition root
  src/runner/        command definitions, dispatch, parsing, help, error reporting
  src/commands/      command definitions, registered in commands/index.ts
  src/__mocks__/     the CLI's own mocks of core services
packages/core/       @nomnom/core, all business logic
  src/index.ts       the public API; the package exports nothing else
  src/errors.ts      NomnomError
  src/services.ts    Services and createServices
  src/<area>/        ports, adapters and services, with __mocks__/ next to them
```

Core is imported only as `@nomnom/core`. It exports TypeScript source directly (no build step), and only its `.` entry: deep imports such as `@nomnom/core/src/...` do not resolve.

## What core may and may not do

All business logic lives in core. Core never:

- reads `process.argv`, `Bun.argv` or the environment (`process.env`, `Bun.env`)
- prints (`console`, `process.stdout`) or exits
- calls `new Date()` or `Date.now()` for the current time: it asks the injected `Clock`
- touches the file system outside an adapter
- decides how an error is shown

Runtime values that come from the process (the data directory from `NOMNOM_DIR`, the loaded config) are resolved by the CLI and passed to core as plain values.

## Services

Every service is created by a factory that takes its dependencies as one object and returns an interface:

```ts
export interface FoodService { add(input: NewFood): Promise<FoodRecord> }
export function createFoodService(deps: { store: VersionedStore; clock: Clock }): FoodService
```

- Dependencies are interfaces (ports or other services), so tests can replace each one with a mock.
- Factories do no I/O. Building the whole graph is cheap, and the CLI does it on every run.
- `createServices({ fs, clock, dataDir })` in `services.ts` wires all services together and returns `Services`. It is the only place that knows how services depend on each other. Add every new service there, and export its interface from `src/index.ts`.
- No DI container and no classes with constructor injection.

## Ports and adapters

A port is an interface for something outside the process (`FileSystem`, `Clock`). An adapter is its real implementation.

- Adapters that use Bun or Node I/O APIs are named `bun-*.ts`. They are the only core files allowed to use `Bun` and `node:fs`, and they are tested against the real system (a temporary directory for the file system).
- Keep ports narrow and shaped by what the domain needs, not a mirror of `node:fs`. Add an operation only when a feature needs it, and add it to the port, the adapter, the in-memory mock and the shared contract tests (`fs/file-system.contract.ts`) together.

## Errors

- Throw `NomnomError(message, problems?)` for errors the user can fix. Each problem is `{ file, line?, message }`.
- Any other exception is treated as unexpected, and the CLI prints its stack trace.
- Core never formats errors for display; the CLI does.

## Enforced boundaries

Biome overrides in `biome.json` enforce these. `bun run check` fails on a violation.

| Files | `console` | `process` | `Bun` | `node:fs` | imports from `__mocks__` |
|---|---|---|---|---|---|
| `packages/core/src/**` | no | no | no | no | no |
| `packages/core/src/**/bun-*.ts` (adapters and their tests) | no | no | yes | yes | no |
| `apps/cli/src/**` except `index.ts` | no | no | no | no | no |
| `apps/cli/src/index.ts` (and its end-to-end test) | yes | yes | yes | no | no |
| `apps/cli/src/e2e/**` (end-to-end helper and tests) | no | yes | yes | yes | no |
| `**/*.test.ts`, `**/__mocks__/**` | as for their area | as for their area | as for their area | as for their area | yes |

Also enforced:

- `process` and `Bun` cannot be reached through `node:process` or `bun` imports where the globals are denied.
- Core may not import `@nomnom/cli`.
- The CLI may not reach into `packages/` by relative path.

Lint cannot see `Bun.argv` or `Bun.env` read inside an adapter, or `new Date()` used for the current time. Those rules hold anyway.

When you change a boundary, update the table here and the overrides in `biome.json` together. Each more specific override restates the complete options of the rules it touches.
