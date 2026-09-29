## Why

`nomnom log` adds exactly one entry per call, and its unit is all the remaining positional words, so there is no room for a second entry. An 8-item breakfast takes 8 calls, each reading, validating and rewriting the same day file, and a mistake halfway leaves the meal half logged. The old tool took repeated `--item` options in `log add`, and logging a meal in one call is what an agent recording meals needs most.

## What Changes

- `nomnom log <meal>` accepts a repeatable `--entry <line>`. Each value is written like an entry line in a day file: a reference `<slug>[@<version>] <amount> [<unit>]` or an inline entry `"<description>" <nutrient>=<number> ...`. The only difference from a day file is that the version is optional: without it, the latest version is pinned, as today.
- References and inline entries can be mixed in one call. All entries go to one meal on one date.
- `--entry` can't be combined with the single-entry forms: the positional `<slug> <amount> [<unit> ...]` and `--inline` with nutrient options. Those forms, their validation and their output don't change.
- An `--entry` value can't contain a comment: a `#` outside the quoted description of an inline entry is an error. nomnom still never writes comments.
- All or nothing: every entry is checked by the rules of a hand-written line before anything is written. When any entry is invalid, the command writes nothing and reports every invalid entry with its position and text, not just the first.
- The new lines are inserted together, in the order given, where a single entry would go today. Existing lines stay byte for byte as they were. Each line is written in the standard form: version pinned, unit always present, single spaces, inline nutrients in catalog order.
- On success, the command prints each added line in order, one per line. Warnings about the existing day file are printed as today.
- A dry run (`--dry-run`, from `add-dry-run`) of several entries prints the lines it would add and previews them as one inserted block.
- A problem that isn't located in a file, such as an invalid `--entry`, is printed as its message alone, instead of after an empty file name and `: `.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `daily-log`: the `log` command gets `--entry` and adds one or more entries atomically; the insertion rule covers several lines; the dry run of `log` covers several lines.
- `cli`: error reporting prints a problem without a file as its message alone.

## Impact

- `@nomnom/core`: `LogInput` gains `entries`, and `Logged` returns every added line instead of one. `DayLogService.log` builds and checks every entry before it reads and writes the day file once. `daylog/parse.ts` gains parsing of an `--entry` value (a day-file entry line with an optional version and no comment). `insertEntry` becomes `insertEntries`, inserting several lines at one point.
- `@nomnom/cli`: `log` declares `--entry` (repeatable) and prints every added line. The runner prints problems without a file as their message alone.
- No change to the day-file format or to any other command.
- Depends on `add-dry-run` (the `Dry run of log` requirement, `writes: true` on `log`, commit after success). Apply and archive that change first.
- Out of scope: several meals or dates in one call, comments in logged entries, aligning new lines with existing columns, reading entries from standard input, and printing totals.
