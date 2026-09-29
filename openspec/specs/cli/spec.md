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
A command that completes successfully SHALL exit with status 0. A user-fixable error raised by the application SHALL be printed to standard error as its message, followed by each located problem it carries on its own line (for example `logs/2026/2026-09-28.nom:4: unknown food`), with no stack trace, and the exit status SHALL be 1. Any other failure SHALL print the error with its stack trace to standard error and exit with status 1. Normal command output SHALL go to standard output, and errors SHALL go to standard error.

#### Scenario: User-fixable error
- **WHEN** a command fails with a user-fixable error carrying the message `Day file has errors` and two located problems
- **THEN** standard error contains the message and both problems on separate lines without a stack trace, and the exit status is 1

#### Scenario: Unexpected failure
- **WHEN** a command fails with an unexpected exception
- **THEN** standard error contains the error and its stack trace, and the exit status is 1

#### Scenario: Successful command
- **WHEN** a command completes without error
- **THEN** its output is on standard output and the exit status is 0
