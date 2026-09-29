## ADDED Requirements

### Requirement: Dry run of log
`nomnom log` SHALL accept `--dry-run`, with the behaviour and output defined by the `cli` spec. It SHALL print the line it would add, as a real run does, and preview the day file: a new file with its section header and entry, or the lines it would insert into the existing file with up to two unchanged lines before and after them. Warnings about the existing day file SHALL be printed as in a real run, and a day file with errors SHALL fail the dry run as it fails a real run.

#### Scenario: Dry run into an existing section
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast apple 150 g --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `apple@2 150 g`, the line as a real run prints it, then the preview of `logs/2026/2026-09-30.nom` with `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ apple@2 150 g`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of the first entry of the day
- **WHEN** no day file exists for 2026-09-30 and `nomnom log snack --inline 'cookie' --kcal 120 --date 2026-09-30 --dry-run` runs
- **THEN** the preview shows `logs/2026/2026-09-30.nom` as a new file with `+ [snack]` and `+ "cookie" kcal=120`, and neither the file nor `logs/2026/` is created

#### Scenario: Dry run against a day file with errors
- **WHEN** the day file contains an invalid line and `nomnom log breakfast apple 150 g --dry-run` runs for that day
- **THEN** the command fails and reports the existing errors, as without `--dry-run`
