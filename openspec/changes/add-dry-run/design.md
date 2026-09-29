## Context

Every write nomnom makes goes through two operations of the `FileSystem` port: `createExclusive` (new food and recipe files, the default `config.yaml`) and `replaceAtomic` (appending a version with `VersionedStore.appendFood|appendRecipe`, and day files in `DayLogService.log`). Directories are created only inside the Bun adapter, as part of those two calls. Services write as they go, and the runner resolves the command context (`config.load()`, which creates a missing `config.yaml`) before it parses arguments or checks `--help`.

All writes only add text: a new file, a document appended after the existing text, or lines inserted into a day file.

`food update` and `recipe update` write twice on a rename: `createX(newSlug)`, then an archiving `appendX(oldSlug)`. A failure of the second write is turned into `renameIncomplete(...)` ("Created X, but archiving 'y' failed ... Run 'nomnom food archive y'"), in `catalog/catalog.ts`.

## Goals / Non-Goals

**Goals:**
- A dry run takes the same code path as a real run, so it cannot drift from it; only the final commit differs.
- No service, the store or the `FileSystem` port changes to support dry runs.
- Every writing command gets `--dry-run` from its definition, so parsing and help stay in sync.

**Non-Goals:**
- Atomic commits across several files. A commit writes files one by one; a failure partway is reported, not rolled back.
- Locking against other nomnom processes between the checks and the commit.
- Machine-readable (JSON) dry-run output.

## Decisions

### Stage every write in a FileSystem decorator, commit at the end

`createStagedFileSystem(inner: FileSystem): StagedFileSystem` in `packages/core/src/fs/staged-file-system.ts`:

```ts
export interface StagedWrite {
	path: string;
	/** The file's text before the command, or `undefined` for a new file. */
	before: string | undefined;
	/** The text the command would write. */
	after: string;
}

export interface StagedFileSystem extends FileSystem {
	/** The writes held so far, in the order their paths were first written. */
	staged(): StagedWrite[];
	/** Writes the held files to `inner` in that order, then forgets them. */
	commit(): Promise<void>;
}
```

- Writes go to an in-memory map keyed by path. Each entry keeps the operation of its first write (`create` or `replace`), `before` (read from `inner` at that moment) and the latest `after`.
- `readText` returns a staged text first, then `inner`'s. `exists` is true for a staged file, for a directory that a staged path lies under, or when `inner` says so. `list` merges staged files and implied directories into `inner`'s entries, sorted with `compareEntries`.
- `createExclusive` throws `FileExistsError` when the path is staged or `inner.exists(path)`. So the store's `'<slug>' already exists` check still happens while the command runs.
- `commit()` replays each entry with the operation of its first write: `createExclusive` or `replaceAtomic`, with the final text. On the first failure it throws a `NomnomError` that names the files already written, plus a problem `{ file, message }` for the failed one with the underlying reason. A `FileExistsError` reads as "was created by someone else meanwhile". Later files are not attempted.

The decorator uses only the port, so it's pure core code, not an adapter. It runs the shared `describeFileSystemContract` suite over the in-memory file system: reads that see staged writes have to behave like a real file system.

Alternatives considered:
- **A `dryRun` flag on each writing service method.** Every write site needs a branch, including the second write of a rename and the default `config.yaml`, and each needs its own test. Missing one breaks the promise silently.
- **Staging only in a dry run, switched on after a pre-scan of argv for `--dry-run`.** This keeps normal runs writing as they go, but then the dry run and the real run differ in when writes happen. The runner would also have to scan raw tokens before parsing to catch the `config.yaml` created by `resolveContext`. Staging always removes both problems, and a failed command or `--help` no longer leaves `config.yaml` behind.

### The runner decides: commit, preview or discard

`runCli` gets a new input, `writes: Pick<StagedFileSystem, "staged" | "commit">`. `index.ts` builds `createStagedFileSystem(createBunFileSystem())`, passes it to `createServices`, and passes the same object as `writes`.

```
resolveContext -> help? ----------------------------> print help, return 0      (staged writes dropped)
               -> parse -> usage error --------------> return 1                  (dropped)
               -> run(io = buffered stdout)
                     error -------------------------> report, return 1          (dropped, buffered stdout dropped)
                     ok, --dry-run -----------------> print stdout + previews + "Dry run: ...", return 0
                     ok -> commit() -> error -------> report, return 1          (buffered stdout dropped)
                                    -> ok ----------> print stdout, return 0
```

- The command gets an `Io` whose `stdout` appends to a buffer. `stderr` passes straight through, so warnings still appear while the command runs. The buffer is written only after a successful commit, so "Created X" is never printed for a file that wasn't written.
- Every successful command commits, including read-only ones such as `food list` and `report`. Their only possible staged write is the default `config.yaml`.
- The process is short-lived and runs one command, so the staged file system needs no reset.

### `writes: true` adds `--dry-run` from the definition

`CommandDefinition` gains `writes?: boolean`, and `CommandInfo` exposes it. For such a command, the runner adds one option to the resolved options (static or context-dependent) before help and parsing:

```ts
"dry-run": { type: "boolean", description: "Check everything and show what would be written, without changing any file" }
```

The runner removes `dry-run` from `values` before calling `run`, and passes it as `CommandEnv.dryRun: boolean`, which is always set (`false` for commands that don't write). `defineCommand` throws when a command declares its own `dry-run` option. Nutrient ids can't contain `-`, so a nutrient option can't clash with it.

The eight writing commands declare `writes: true`: `food add|update|archive|unarchive`, `recipe add|update|archive|unarchive`, and `log`.

### Wording and previews in the CLI

- `format.ts` gets `writeVerb(verb, dryRun)`, which maps `Created`, `Updated`, `Archived` and `Unarchived` to `Would create`, `Would update`, `Would archive` and `Would unarchive`. `formatUpdated` takes `dryRun`, and a new `formatArchived(path, version, { archived, dryRun })` replaces the inline strings of the four archive and unarchive commands. `food add` and `recipe add` use `writeVerb`. `log` prints its line unchanged.
- `runner/preview.ts` formats one `StagedWrite` as the `cli` spec defines. The text is split into lines, ignoring the empty string after a final `\n`. For an existing file, the preview trims the longest common prefix and suffix of lines. The rest of `before` is the removed lines, and the rest of `after` is the added lines, with up to 2 unchanged lines on each side. The whole preview section is formatted in the runner, since it's about files, not about any one command.
- A new `config.yaml` is previewed like any other new file, in full. This only happens on the first run in a data directory, and it needs no special case.

### Remove `renameIncomplete`

With staging, the second write of a rename can only fail during the command's checks (for example, the old file no longer parses), and then nothing has been written. The message "Created X, but archiving failed" would be false. The real partial failure now happens in `commit()`, which reports it generically. `renameIncomplete` and its two call sites go. The core test "an archiving write that fails after the new file was created" is replaced by a staged file system test in which the second of two commits fails.

## Risks / Trade-offs

- [Another process creates a file between the checks and the commit] → `createExclusive` at commit time still refuses to overwrite it, and the error names what was written. The same race exists today.
- [A commit fails partway, for example after the new file of a rename] → The error names the written files and the one that failed. The user can archive the old item by hand. The `archive` suggestion that `renameIncomplete` gave is lost; the file names are enough.
- [Buffered output: a command that runs long prints nothing until it finishes] → Every command is short, and warnings on stderr still stream.
- [Preview of a change with several separate regions] → Trimming only the common prefix and suffix shows one region, with any unchanged lines in between as removed and re-added. nomnom's writes are single insertions today, so this doesn't happen yet.
- [`created:` timestamps differ between the dry run and a later real run] → The spec says the preview's timestamps are those of the dry run.
- [Behaviour change: `config.yaml` is no longer created by a failed command or by `--help`] → Specified in `data-directory`. Nothing reads `config.yaml` before a successful command would have created it.
