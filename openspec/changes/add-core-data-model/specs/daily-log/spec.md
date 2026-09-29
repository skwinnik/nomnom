## Purpose

Defines the plain-text daily log: one `.nom` file per date recording what was eaten, grouped by meal, as pinned references to foods or recipes or as inline nutrient totals, with the day's nutrient totals stored on its first line. Also defines `nomnom log`, which adds entries without disturbing hand-written content, and `nomnom validate log`, which checks and repairs day files.

## ADDED Requirements

### Requirement: Day file location
Each local calendar date SHALL have at most one log file at `logs/<yyyy>/<yyyy-mm-dd>.nom`. A missing file SHALL mean nothing was logged that day.

#### Scenario: Path for a date
- **WHEN** an entry is logged for 2026-09-29
- **THEN** it is written to `logs/2026/2026-09-29.nom`

### Requirement: Line types
A day file SHALL be a sequence of lines. Leading and trailing whitespace on a line SHALL be ignored, and the first remaining character SHALL determine the line type:
- empty line: blank
- `#`: comment, ignored
- `=`: totals line
- `[`: section header `[<meal>]`
- `"`: inline entry
- anything else: reference entry

A `#` preceded by whitespace SHALL start a trailing comment that runs to the end of the line, except inside the quoted description of an inline entry.

#### Scenario: Comments
- **WHEN** a file contains `# ate late today` and `apple@2 1 small sized apple  # at work`
- **THEN** the first line is ignored and the second is a reference entry with the unit `small sized apple`

#### Scenario: Example day
- **WHEN** a file contains:
  ```
  = kcal=1051 protein=43.2 fat=1.2 carbs=26.5 fiber=4.4

  [breakfast]
  greek-yogurt-2-460123@1  150 g
  apple@2                  1 medium sized apple

  [dinner]
  "restaurant ramen"       kcal=800 protein=35
  ```
- **THEN** it parses into a totals line, a `breakfast` section with two reference entries, and a `dinner` section with one inline entry

### Requirement: Sections
A section header `[<meal>]` SHALL start a section that runs until the next header or the end of the file. Every entry SHALL be inside a section. When a meal's section appears more than once, its entries SHALL be merged. A section whose meal is not in the configuration SHALL be accepted with a warning and treated as ordered after all configured meals.

#### Scenario: Entry before any section
- **WHEN** the first entry in a file comes before any section header
- **THEN** parsing fails with an error naming the file and line number

#### Scenario: Duplicate sections
- **WHEN** a file has two `[lunch]` sections with one entry each
- **THEN** the day's `lunch` has both entries

#### Scenario: Unknown meal
- **WHEN** a file has a `[brunch]` section and `brunch` is not in the configured meals
- **THEN** the file parses, `brunch` is kept, and a warning names `brunch`

### Requirement: Reference entries
A reference entry SHALL have the form `<slug>@<version> <amount> [<unit>]`, with tokens separated by whitespace. The version is required. The amount SHALL be a positive number. The unit is the rest of the line after the amount (excluding a trailing comment), normalised like unit names; when absent, the item's default unit is used (as for recipe ingredients). The slug SHALL resolve to a food or recipe in the shared namespace, the version SHALL exist, and the unit SHALL be allowed by that version.

#### Scenario: Pinned reference with a multi-word unit
- **WHEN** a line reads `apple@2 1 medium sized apple`
- **THEN** it is an entry for version 2 of `apple`, amount 1, unit `medium sized apple`

#### Scenario: Reference without a version
- **WHEN** a line reads `apple 1 medium sized apple`
- **THEN** parsing fails with an error naming the line number and explaining that a version is required

#### Scenario: Unit not allowed
- **WHEN** a line reads `apple@2 1 cup` and `apple@2` has no `cup` unit
- **THEN** validation fails with an error naming the line number and the unit

### Requirement: Inline entries
An inline entry SHALL have the form `"<description>" <nutrient>=<number> ...`. The description SHALL be non-empty and SHALL NOT contain `"`. The entry SHALL contain at least one nutrient value, and every key SHALL be a nutrient id in the catalog, given at most once, with a non-negative number. Required nutrients SHALL be present. The values are the totals consumed; an inline entry has no amount or unit. Absent nutrients SHALL count as 0.

#### Scenario: Valid inline entry
- **WHEN** a line reads `"restaurant ramen" kcal=800 protein=35`
- **THEN** it is an inline entry contributing 800 kcal, 35 g protein and 0 of every other nutrient

#### Scenario: Key that is not a nutrient
- **WHEN** a line reads `"ramen" kcal=800 weight=300`
- **THEN** validation fails with an error naming the line number and `weight`

#### Scenario: Required nutrient missing
- **WHEN** a line reads `"ramen" protein=35` and `kcal` is required
- **THEN** validation fails with an error naming the line number and `kcal`

#### Scenario: Amount and unit instead of nutrients
- **WHEN** a line reads `"ramen" 300 g`
- **THEN** validation fails with an error naming the line number

### Requirement: Day totals line
A day file SHALL store the day's nutrient totals in a totals line of the form `= <nutrient>=<number> ...` as its first line. The totals SHALL be the sum over every entry in the file, in every section including unknown meals: the calculated nutrients of each reference entry (as for recipe ingredients) plus the values of each inline entry. The line SHALL list every nutrient in the current catalog, in catalog order, zeros included. Values SHALL be rounded to one decimal place and written without trailing zeros (`1051`, not `1051.0`). The entries SHALL be the source of truth: the totals line is saved output and SHALL NOT be used as an input to any calculation.

A day file is valid without a totals line. Problems with the totals line SHALL be reported as warnings, never as errors: the line is missing, its values differ from the recalculated totals (stale), it is malformed, it is not the first line, or there is more than one. Totals SHALL only be calculated and written for a day file without errors.

#### Scenario: Totals of a day
- **WHEN** a day has `chicken-soup@1 1 serving` (136.3 kcal) and `"cake" kcal=450 fat=20`
- **THEN** its totals line starts with `= kcal=586.3` and includes `fat=20` plus every other catalog nutrient

#### Scenario: Stale totals after a hand edit
- **WHEN** an entry is added to a day file by hand and the totals line is not updated
- **THEN** validation reports a warning that the totals are stale, with the file path, and the day is not treated as invalid

#### Scenario: Nutrient added to the catalog
- **WHEN** `sodium` is added to the catalog after a day's totals line was written
- **THEN** that totals line is reported as stale, because it lacks `sodium`

#### Scenario: Hand-written file without totals
- **WHEN** a valid day file has no totals line
- **THEN** it is valid, and validation reports a warning that the totals are missing

### Requirement: Invalid day files
When a day file has any syntax or validation error, the system SHALL report every error it finds, each with the file path and line number, and SHALL treat the day as invalid rather than skip the bad lines.

#### Scenario: Several errors
- **WHEN** a file has errors on lines 3 and 7
- **THEN** both errors are reported with their line numbers

### Requirement: log command
`nomnom log` SHALL add one entry to a day file. It SHALL accept:
- `nomnom log <meal> <slug>[@<version>] <amount> [<unit> ...]` to add a reference entry; without a version, the latest version is pinned; the remaining positional words form the unit
- `nomnom log <meal> --inline <description> --<nutrient-id> <number> ...` to add an inline entry
- `--date <yyyy-mm-dd>` (optional; default: today's local date)

The meal SHALL be one of the configured meals. The command SHALL validate the new entry by the same rules as a hand-written line, SHALL reject references to archived items, and SHALL refuse to write when the existing day file has errors, reporting them instead. Warnings about the existing totals line SHALL NOT block logging. On success it SHALL write the day's recalculated totals line, then print the line it added and the day's new totals.

#### Scenario: Log a reference with the latest version
- **WHEN** `nomnom log breakfast apple 1 medium sized apple --date 2026-09-29` runs and the latest version of `apple` is 2
- **THEN** the line `apple@2 1 medium sized apple` is added to the `breakfast` section of `logs/2026/2026-09-29.nom`, and the file's totals line includes the apple

#### Scenario: Log an inline entry
- **WHEN** `nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35` runs
- **THEN** the line `"restaurant ramen" kcal=800 protein=35` is added to today's `dinner` section, with nutrients in catalog order

#### Scenario: Meal not configured
- **WHEN** `nomnom log brunch apple 1` runs and `brunch` is not a configured meal
- **THEN** the command fails with an error listing the configured meals and nothing is written

#### Scenario: Existing file has errors
- **WHEN** the day file contains an invalid line and an entry is logged for that day
- **THEN** the command fails, reports the existing errors, and does not modify the file

#### Scenario: Existing totals are stale
- **WHEN** the day file was edited by hand, its totals line is stale, and an entry is logged for that day
- **THEN** the entry is added and the totals line is replaced with totals covering every entry, including the hand-written ones

### Requirement: Writing preserves existing content
When the system writes to an existing day file, every existing line other than totals lines SHALL be kept exactly as it was. A write SHALL leave exactly one totals line, on the first line, followed by a blank line when the next line is not blank; any other totals lines SHALL be removed.

When `nomnom log` adds an entry, only one entry line SHALL be inserted. It SHALL go right after the last entry or comment line of the meal's last section. When the meal has no section, a new section with the entry SHALL be inserted before the first section whose meal comes later in the configured order (unknown meals count as later than all configured ones), or appended at the end of the file otherwise, separated from neighbouring content by a blank line. A new file SHALL contain the totals line, a blank line, the section header and the entry. The file SHALL end with a newline.

#### Scenario: Append to an existing section
- **WHEN** the file has `[breakfast]` with two entries followed by a blank line and `[lunch]`, and a breakfast entry is logged
- **THEN** the new line is inserted directly after the second breakfast entry, the totals line is updated, and all other lines, including comments and alignment, are unchanged

#### Scenario: New section in configured order
- **WHEN** the file has only `[breakfast]` and `[dinner]` sections and a lunch entry is logged
- **THEN** a `[lunch]` section with the entry is inserted between them, separated by blank lines

#### Scenario: First entry of the day
- **WHEN** no file exists for the date and a snack entry is logged
- **THEN** the file is created with the totals line, a blank line, `[snack]` and the entry

#### Scenario: Misplaced totals line
- **WHEN** a hand-edited file has a totals line in the middle of the `[lunch]` section and the file is written
- **THEN** that line is removed and a single up-to-date totals line is written as the first line

### Requirement: validate log command
`nomnom validate log` SHALL check day files and report every error and warning, each with the file path and, where applicable, the line number. Without options it SHALL check every file matching `logs/<yyyy>/<yyyy-mm-dd>.nom`; other files under `logs/` SHALL be reported as warnings and otherwise ignored. With `--date <yyyy-mm-dd>` it SHALL check only that day's file; when that file does not exist, it SHALL report that nothing was logged that day. The command SHALL exit with status 1 when any file has errors, and with status 0 otherwise, including when there are only warnings.

With `--fix`, for every checked file that has no errors and whose totals line has a problem, the command SHALL rewrite the file following the rules for preserving existing content, so that it has one up-to-date totals line. Files with errors SHALL NOT be modified. The command SHALL print which files it fixed.

#### Scenario: All files valid and up to date
- **WHEN** every day file is valid with up-to-date totals and `nomnom validate log` runs
- **THEN** it reports no problems and exits with status 0

#### Scenario: Errors in one file
- **WHEN** `logs/2026/2026-09-28.nom` has an invalid line 4 and `nomnom validate log` runs
- **THEN** it reports `logs/2026/2026-09-28.nom:4` with the error and exits with status 1

#### Scenario: Fixing stale totals
- **WHEN** `logs/2026/2026-09-29.nom` has stale totals, `logs/2026/2026-09-28.nom` has an error, and `nomnom validate log --fix` runs
- **THEN** the totals line of the 29th is rewritten, the 28th is unchanged and its error is reported, and the command exits with status 1

#### Scenario: One day only
- **WHEN** `nomnom validate log --date 2026-09-29 --fix` runs
- **THEN** only `logs/2026/2026-09-29.nom` is checked and, if needed, fixed

#### Scenario: Stray file
- **WHEN** `logs/notes.txt` exists and `nomnom validate log` runs
- **THEN** a warning names `logs/notes.txt` and the command's exit status is unaffected
