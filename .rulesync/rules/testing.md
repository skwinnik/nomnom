---
root: false
targets: ["*"]
description: "Testing conventions: test placement, mocks and type checking"
globs: ["**/*.test.ts", "**/__mocks__/**"]
---

# Testing

## Where tests go

- A test sits next to the file it tests as `<name>.test.ts`. The root `bun test` finds tests in every workspace.
- Tests use `bun:test`. Type-level expectations use `expectTypeOf` or `// @ts-expect-error`, and `bun run typecheck` checks them.

## Mocks

- A mock lives in a `__mocks__/` folder next to the module it replaces (`fs/__mocks__/file-system.ts`). Bun does not load `__mocks__` automatically: with dependency injection, a test passes the mock in.
- A mock is typed as the interface it replaces, so a change to the interface breaks the mock at type-check time.
- Only tests and other mocks may import from `__mocks__`. Lint enforces this.

## Mock only direct dependencies

- Core tests mock ports, or other services when a service is tested in isolation.
- CLI tests mock the core services a command uses, in `apps/cli/src/__mocks__/`, and pass only those. They never import core mocks: core does not export them, and lint forbids reaching into `packages/`.
- Most CLI tests call `runCli` in-process with mocked services and captured `io` (`createCapturedIo` from `apps/cli/src/__mocks__/io.ts`). A few end-to-end tests spawn `bun apps/cli/src/index.ts` to prove the wiring. They use `withSandbox` from `apps/cli/src/e2e/nomnom.ts`, which runs the CLI with `NOMNOM_DIR` set to a fresh temporary directory and removes it afterwards, so they never touch real data.

## Adapters

- Adapters (`bun-*.ts`) are tested against the real system: file-system adapters against a fresh temporary directory, removed afterwards.
- A port's behaviour is written once as a contract suite (for example `fs/file-system.contract.ts`) and run against both the in-memory mock and the adapter, so the mock cannot drift from the real thing.

## Before finishing

Run `bun test`, `bun run typecheck` and `bun run check`. Bun never checks types, so without `typecheck` a mock that no longer matches its interface passes silently. The pre-commit hook runs `typecheck` too.
