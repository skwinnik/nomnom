## ADDED Requirements

### Requirement: Writes are committed after the command succeeds
A command SHALL change no file until it has completed successfully. Every file a command writes, including the default `config.yaml`, SHALL be written only after the command has finished without error, in the order the command produced them. A command that fails, a usage error, and `--help` SHALL change no file and create no directory.

The command's standard output SHALL be printed only after its files are written, so that it never reports a file that was not written. Standard error, such as warnings, is printed while the command runs.

When writing the files fails partway, the command SHALL exit with status 1 and print an error that names each file already written, the file that could not be written and the reason. Files after the failed one SHALL NOT be written, and the command's standard output SHALL NOT be printed.

#### Scenario: Failed command writes nothing
- **WHEN** the data directory does not exist and `nomnom food add --name Apple --base-unit g --kcal abc` runs
- **THEN** the command fails with its usual error, and the data directory still does not exist

#### Scenario: Help writes nothing
- **WHEN** the data directory does not exist and `nomnom food add --help` runs
- **THEN** the help is printed, the exit status is 0, and the data directory still does not exist

#### Scenario: Writing fails partway
- **WHEN** a command writes `foods/green-apple.yaml` and then `foods/apple.yaml`, and writing `foods/apple.yaml` fails with `disk full`
- **THEN** the exit status is 1, standard error names `foods/green-apple.yaml` as written and `foods/apple.yaml` as not written with `disk full`, and nothing is printed to standard output

### Requirement: Dry run for writing commands
Every command that writes data SHALL accept a `--dry-run` flag, declared in its definition like any other option so that its help lists it. Commands that don't write data SHALL NOT accept it.

With `--dry-run`, the command SHALL perform every check and computation of a real run, fail with the same errors a real run would, and SHALL change no file and create no directory. On success it SHALL print to standard output:
1. The command's usual output, with each verb that reports a write put in the conditional: `Created` becomes `Would create`, `Updated` becomes `Would update`, `Archived` becomes `Would archive`, `Unarchived` becomes `Would unarchive`.
2. A blank line, then one preview per file the command would write, in the order it would write them, separated by blank lines.
3. A blank line, then the line `Dry run: no files were changed.`

A preview SHALL start with the file's path, followed by ` (new file)` when the file does not exist. For a new file, it SHALL then list every line of the file prefixed with `+ `. For an existing file, it SHALL list the lines that would be added, prefixed with `+ `, and the lines that would be removed, prefixed with `- `, with up to two unchanged lines before and after them prefixed with two spaces. An empty line prefixed with `+ ` or with two spaces SHALL be printed without trailing spaces.

The files previewed SHALL be exactly the files a real run would write at that moment, with the same content, except that timestamps are those of the dry run.

#### Scenario: Dry run of a new file
- **WHEN** `nomnom food add --name Apple --base-unit g --kcal 52 --dry-run` runs and no food `apple` exists
- **THEN** standard output is `Would create <data>/foods/apple.yaml`, a blank line, `<data>/foods/apple.yaml (new file)`, each line of the YAML document prefixed with `+ `, a blank line, and `Dry run: no files were changed.`, and `foods/apple.yaml` does not exist afterwards

#### Scenario: Dry run of a change to an existing file
- **WHEN** a dry run would insert one line after line 3 of a 6-line file
- **THEN** the preview shows lines 2 and 3 prefixed with two spaces, the new line prefixed with `+ `, then lines 4 and 5 prefixed with two spaces

#### Scenario: Dry run fails like a real run
- **WHEN** `nomnom food add --name Apple --base-unit g --dry-run` runs and `kcal` is required
- **THEN** the command fails with the same error as without `--dry-run`, and prints no preview

#### Scenario: Help lists the flag
- **WHEN** `nomnom food add --help` and `nomnom food list --help` run
- **THEN** the help of `food add` lists `--dry-run`, and the help of `food list` does not, and `nomnom food list --dry-run` fails with a usage error
