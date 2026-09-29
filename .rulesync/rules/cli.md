---
root: false
targets: ["*"]
description: "CLI conventions: thin commands and declarative command definitions"
globs: ["apps/cli/**"]
---

# CLI

## Commands are thin

A command parses nothing by hand, holds no business logic and touches no I/O. It turns parsed arguments into a call to a core service and formats the result. Anything worth testing without the command line belongs in core.

A command writes files only through core services. They write to a staged file system, which the runner commits after the command succeeds, previews on `--dry-run` and drops on an error, so a write that bypasses core would escape both.

## One definition per command

Every command is a `defineCommand` value in `apps/cli/src/commands/`, registered in `commands/index.ts`:

```ts
export const foodAdd = defineCommand({
	name: ["food", "add"],
	summary: "Add a food",
	positionals: [{ name: "file", description: "...", optional: true }],
	options: {
		name: { type: "string", short: "n", required: true, description: "Display name" },
		barcode: { type: "string", multiple: true, valueName: "digits", description: "Barcode" },
	},
	run: async ({ values, positionals }, { services, io }: CommandEnv<Pick<Services, "foods">>) => {
		// ...
	},
});
```

- The definition is the only source of the command's arguments and of its help. Never write help text by hand, and never read an option that is not declared.
- `values` is typed from the option specs: `required` or defaulted options are always set, and `multiple` options are arrays.
- When options depend on runtime data (for example the config), make `options` a function of `CommandContext`. The runner resolves the context at most once per run, and only for such commands.
- Declare the services a command uses by annotating `run`'s second parameter with `CommandEnv<Pick<Services, ...>>`.
- Multi-word names form groups (`food add`, `food list` -> `food`). The runner lists a group's subcommands itself.
- A command that writes data declares `writes: true`. The runner then adds `--dry-run` to its options and help, and passes it as `CommandEnv.dryRun` (always set; `false` for other commands) instead of in `values`. Never declare a `dry-run` option yourself: `defineCommand` throws. With `dryRun`, word each reported write in the conditional with `writeVerb` and the other helpers in `commands/format.ts` (`Would create`); the runner prints the file previews itself.

## Output, errors and exit codes

- Write output only through the injected `io.stdout(text)` and `io.stderr(text)`. Include line breaks yourself. Never use `console` or `process`.
- The runner holds standard output until the command's files are written, and drops it when the command or the commit fails. Standard error, such as warnings, is printed at once.
- Let errors propagate. The runner prints a `NomnomError` as its message plus one line per problem (`file:line: message`, or the message alone when the problem has no file), prints the stack trace for anything else, and returns the exit code (0 success, 1 failure or usage error).
- The runner never exits the process. It returns the exit code.

## The entry point

`apps/cli/src/index.ts` is the only CLI file that may touch the process (`process`, `Bun`, `console`). It is the composition root: it wraps the real file system in `createStagedFileSystem`, builds `createServices` with it, resolves `CommandContext`, and passes `Bun.argv.slice(2)`, the command list, `io` and the staged file system as `writes` to `runCli`, then sets `process.exitCode`. Keep it this small.
