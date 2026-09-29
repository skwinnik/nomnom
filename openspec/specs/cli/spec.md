# cli Specification

## Purpose

Defines how the `nomnom` command line behaves regardless of which commands exist: how commands are found, how help is produced from each command's own argument definition, how invalid input is reported, and which exit codes are used.

## Requirements

### Requirement: One definition drives parsing and help
Every command SHALL be described by a single definition that declares its name, a one-line summary, its positional arguments and its options. For each option, the definition gives:
- the name
- an optional one-letter short alias
- the value type (flag or value)
- whether it is required
- whether it can be repeated
- an optional default
- a description

Argument parsing and the command's help output SHALL both be derived from that definition. An option SHALL be accepted by a command if and only if it appears in that command's help. The same SHALL hold for positional arguments. When a command's options depend on runtime data (for example, the user's configuration), the options SHALL be resolved once per run, and the same resolved set SHALL be used for both parsing and help.

#### Scenario: Declared option is documented and accepted
- **WHEN** a command's definition declares a value option `--name` with the description `Display name`
- **THEN** `nomnom <command> --help` lists `--name <value>` with `Display name`, and `nomnom <command> --name Apple` is accepted

#### Scenario: Undeclared option is neither documented nor accepted
- **WHEN** a command's definition does not declare `--colour`
- **THEN** `nomnom <command> --help` does not mention `--colour`, and `nomnom <command> --colour red` fails with a usage error

#### Scenario: Runtime-dependent options appear in help
- **WHEN** a command's options include one option per entry of a runtime-provided list, and the list contains `kcal` and `protein`
- **THEN** `nomnom <command> --help` lists `--kcal` and `--protein`, and both are accepted when parsing

### Requirement: Global usage
Running `nomnom` with no arguments, or with only `--help` or `-h`, SHALL print the global usage to standard output and exit with status 0. The global usage SHALL list every available command by its full name (for example `food add`) with its summary, in a stable order, and SHALL explain how to get help for one command.

#### Scenario: No arguments
- **WHEN** `nomnom` runs with no arguments
- **THEN** the global usage listing every command and its summary is printed to standard output and the exit status is 0

#### Scenario: Help flag
- **WHEN** `nomnom --help` or `nomnom -h` runs
- **THEN** the same global usage is printed to standard output and the exit status is 0

### Requirement: Command help
Running a command with `--help` or `-h` SHALL print that command's help to standard output and exit with status 0, without running the command. The help SHALL contain:
- the summary
- a usage line with the command's full name, its positional arguments (marking optional and repeatable ones) and `[options]`
- every option with its short alias when there is one, a value placeholder for value options, its description, and markers for required, repeatable and default values

Help SHALL take precedence over every other argument error on the same command line. `--help` and `-h` that appear after a `--` terminator SHALL NOT trigger help.

#### Scenario: Help for a command
- **WHEN** `nomnom <command> --help` runs
- **THEN** the command's summary, usage line and full option list are printed to standard output, the command does not run, and the exit status is 0

#### Scenario: Help despite invalid arguments
- **WHEN** `nomnom <command> --unknown-option --help` runs, or the command's required options are missing
- **THEN** the command's help is printed and the exit status is 0

#### Scenario: Help flag after the terminator
- **WHEN** `nomnom <command> -- --help` runs
- **THEN** `--help` is treated as a positional argument, not as a request for help

### Requirement: Command groups
A command name MAY consist of several words (for example `food add`), and a shared leading word forms a group (`food`). Running a group name without a subcommand SHALL print the list of subcommands in that group with their summaries. With `--help` or `-h`, the list SHALL go to standard output with exit status 0. Without them, it SHALL go to standard error with exit status 1.

#### Scenario: Group help
- **WHEN** `nomnom food --help` runs and the commands `food add` and `food list` exist
- **THEN** `food add` and `food list` with their summaries are printed to standard output and the exit status is 0

#### Scenario: Group without a subcommand
- **WHEN** `nomnom food` runs
- **THEN** an error saying a subcommand is required, followed by the subcommands of `food`, is printed to standard error and the exit status is 1

### Requirement: Usage errors
Invalid command lines SHALL be reported on standard error with a message naming the problem, followed by a hint to run the relevant `--help`. The exit status SHALL be 1, and the command SHALL NOT run. The following are usage errors:
- an unknown command
- an unknown option
- a value option given without a value
- a value given to a flag
- a missing required option
- a non-repeatable option given more than once
- too few or too many positional arguments

#### Scenario: Unknown command
- **WHEN** `nomnom frobnicate` runs
- **THEN** standard error contains an error naming `frobnicate` and a hint to run `nomnom --help`, and the exit status is 1

#### Scenario: Unknown option
- **WHEN** a command runs with an option its definition does not declare
- **THEN** standard error contains an error naming the option and a hint to run `nomnom <command> --help`, and the exit status is 1

#### Scenario: Missing required option
- **WHEN** a command whose definition marks `--name` as required runs without `--name`
- **THEN** standard error contains an error naming `--name` and the exit status is 1

#### Scenario: Wrong number of positional arguments
- **WHEN** a command that declares exactly one positional argument runs with none or with two
- **THEN** standard error contains an error about the positional arguments and the exit status is 1

#### Scenario: Non-repeatable option repeated
- **WHEN** a command runs with a non-repeatable option given twice
- **THEN** standard error contains an error naming the option and the exit status is 1

### Requirement: Error reporting and exit codes
A command that completes successfully SHALL exit with status 0. A user-fixable error raised by the application SHALL be printed to standard error as its message, followed by each problem it carries on its own line, with no stack trace, and the exit status SHALL be 1. A problem located in a file SHALL be printed with its file and, when known, its line number (for example `logs/2026/2026-09-28.nom:4: unknown food`). A problem that is not located in a file SHALL be printed as its message alone. Any other failure SHALL print the error with its stack trace to standard error and exit with status 1. Normal command output SHALL go to standard output, and errors SHALL go to standard error.

#### Scenario: User-fixable error
- **WHEN** a command fails with a user-fixable error carrying the message `Day file has errors` and two located problems
- **THEN** standard error contains the message and both problems on separate lines without a stack trace, and the exit status is 1

#### Scenario: Problem without a file
- **WHEN** a command fails with a user-fixable error carrying a problem with the message `entry 2 'unicorn 1': 'unicorn' is neither a food nor a recipe` and no file
- **THEN** that line of standard error is exactly the problem's message, without a leading file name or `: `

#### Scenario: Unexpected failure
- **WHEN** a command fails with an unexpected exception
- **THEN** standard error contains the error and its stack trace, and the exit status is 1

#### Scenario: Successful command
- **WHEN** a command completes without error
- **THEN** its output is on standard output and the exit status is 0

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
