## Why

Eight commands write data: `food add|update|archive|unarchive`, `recipe add|update|archive|unarchive` and `log`. The only way to see what they will write is to run them, and a mistake then needs another version or a hand edit. The old tool had `--dry-run` for every write, and it is most useful now that `update` replaces a whole version from the values given. Today, commands also write as they go: a failed command can leave `config.yaml` behind, and `--help` on a fresh data directory creates it.

## What Changes

- Every command that writes accepts `--dry-run`. A dry run performs every check and computation of a real run, prints what it would write, and changes no file: no data file, no `config.yaml`, and no directory.
- A dry run prints the command's usual output with its verbs in the conditional (`Would create`, `Would update`, `Would archive`, `Would unarchive`), followed by every file it would write with the lines it would add (see the `cli` spec), and ends with `Dry run: no files were changed.`
- Writes are committed only after a command succeeds. A command that fails, and `--help`, change no file. The command's standard output is printed after the commit, so a command never reports a file it did not write. When the commit itself fails partway, the error names the files that were written and the one that failed.
- **BREAKING** (behaviour, not files): the default `config.yaml` is created when a successful command commits its writes, not before the command runs. A command that fails, and `--help`, no longer create it on a fresh data directory. Read-only commands such as `food list` and `report` still create it when they succeed.
- `food update` and `recipe update` no longer have their own error for a rename whose archiving write fails after the new file was created. With writes committed at the end, that case is the generic partial-commit error, which names both files; it no longer suggests the `archive` command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli`: writes are committed only after a command succeeds; commands that write accept `--dry-run`, with a defined preview format.
- `data-directory`: the default `config.yaml` is created when the command's writes are committed; a dry run does not create it or any directory.
- `foods`: `food add`, `food update`, `food archive` and `food unarchive` accept `--dry-run`.
- `recipes`: `recipe add`, `recipe update`, `recipe archive` and `recipe unarchive` accept `--dry-run`.
- `daily-log`: `log` accepts `--dry-run` and shows where in the day file the entry would go.

## Impact

- `@nomnom/core`: a new staged `FileSystem` decorator that holds writes in memory, serves reads from them, lists what it staged, and commits them. The services, the store and the `FileSystem` port don't change. `renameIncomplete` and its use in `FoodService.update` and `RecipeService.update` are removed.
- `@nomnom/cli`: `index.ts` wraps the Bun file system in the staged one. `runCli` commits after a successful command, holds its standard output until then, and prints the preview on `--dry-run`. `defineCommand` gains `writes: true`, which adds `--dry-run` to that command's options and help, and `CommandEnv` gains `dryRun`. The eight writing commands declare `writes: true` and word their output for a dry run.
- No change to file formats or to any command's normal output.
