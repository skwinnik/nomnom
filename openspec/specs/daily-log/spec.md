# daily-log Specification

## Purpose

Defines the plain-text daily log: one `.nom` file per date recording what was eaten, grouped by meal, as pinned references to foods or recipes or as inline nutrient values. Day files store entries only; totals are calculated from the entries when needed. Also defines `nomnom log`, which adds entries without disturbing hand-written content.

## Requirements

### Requirement: Day file location
Each local calendar date SHALL have at most one log file at `logs/<yyyy>/<yyyy-mm-dd>.nom`. A missing file SHALL mean nothing was logged that day.

#### Scenario: Path for a date
- **WHEN** an entry is logged for 2026-09-29
- **THEN** it is written to `logs/2026/2026-09-29.nom`

### Requirement: Line types
A day file SHALL be a sequence of lines. Leading and trailing whitespace on a line SHALL be ignored, and the first remaining character SHALL determine the line type:
- empty line: blank
- `#`: comment, ignored
- `[`: section header `[<meal>]`
- `"`: inline entry
- anything else: reference entry

A `#` preceded by whitespace SHALL start a trailing comment that runs to the end of the line, except inside the quoted description of an inline entry.

A day file SHALL NOT store calculated values such as day totals. They SHALL be calculated from the entries whenever they are needed.

#### Scenario: Comments
- **WHEN** a file contains `# ate late today` and `apple@2 1 small sized apple  # at work`
- **THEN** the first line is ignored and the second is a reference entry with the unit `small sized apple`

#### Scenario: Example day
- **WHEN** a file contains:
  ```
  [breakfast]
  greek-yogurt-2-460123@1  150 g
  apple@2                  1 medium sized apple

  [dinner]
  "restaurant ramen"       kcal=800 protein=35
  ```
- **THEN** it parses into a `breakfast` section with two reference entries and a `dinner` section with one inline entry

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

The meal SHALL be one of the configured meals. The command SHALL validate the new entry by the same rules as a hand-written line, SHALL reject references to archived items, and SHALL refuse to write when the existing day file has errors, reporting them instead. Warnings about the existing day file, such as an unknown meal, SHALL be printed and SHALL NOT block logging. On success it SHALL print the line it added.

#### Scenario: Log a reference with the latest version
- **WHEN** `nomnom log breakfast apple 1 medium sized apple --date 2026-09-29` runs and the latest version of `apple` is 2
- **THEN** the line `apple@2 1 medium sized apple` is added to the `breakfast` section of `logs/2026/2026-09-29.nom` and printed

#### Scenario: Log an inline entry
- **WHEN** `nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35` runs
- **THEN** the line `"restaurant ramen" kcal=800 protein=35` is added to today's `dinner` section, with nutrients in catalog order

#### Scenario: Meal not configured
- **WHEN** `nomnom log brunch apple 1` runs and `brunch` is not a configured meal
- **THEN** the command fails with an error listing the configured meals and nothing is written

#### Scenario: Existing file has errors
- **WHEN** the day file contains an invalid line and an entry is logged for that day
- **THEN** the command fails, reports the existing errors with their line numbers, and does not modify the file

#### Scenario: Existing file has warnings
- **WHEN** the day file has a `[brunch]` section, `brunch` is not a configured meal, and a breakfast entry is logged for that day
- **THEN** the command prints a warning naming `brunch` and the entry is added

### Requirement: Writing preserves existing content
When the system writes to an existing day file, every existing line SHALL be kept exactly as it was.

When `nomnom log` adds an entry, only one entry line SHALL be inserted. It SHALL go right after the last entry or comment line of the meal's last section. When the meal has no section, a new section with the entry SHALL be inserted before the first section whose meal comes later in the configured order (unknown meals count as later than all configured ones), or appended at the end of the file otherwise, separated from neighbouring content by a blank line. A new file SHALL contain the section header and the entry. The file SHALL end with a newline.

#### Scenario: Append to an existing section
- **WHEN** the file has `[breakfast]` with two entries followed by a blank line and `[lunch]`, and a breakfast entry is logged
- **THEN** the new line is inserted directly after the second breakfast entry, and all other lines, including comments and alignment, are unchanged

#### Scenario: New section in configured order
- **WHEN** the file has only `[breakfast]` and `[dinner]` sections and a lunch entry is logged
- **THEN** a `[lunch]` section with the entry is inserted between them, separated by blank lines

#### Scenario: First entry of the day
- **WHEN** no file exists for the date and a snack entry is logged
- **THEN** the file is created with `[snack]` and the entry

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
