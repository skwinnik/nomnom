## MODIFIED Requirements

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
