## ADDED Requirements

### Requirement: Entries given with --entry
Each `--entry` value of `nomnom log` SHALL be written like an entry line of a day file, with leading and trailing whitespace ignored:
- a reference `<slug>[@<version>] <amount> [<unit>]`, where, unlike in a day file, the version is optional; without it, the latest version is pinned
- an inline entry `"<description>" <nutrient>=<number> ...`

Every value SHALL follow the rules of a hand-written entry line of its type. A value SHALL NOT contain a comment: a `#` outside the quoted description of an inline entry SHALL be rejected. A value that is empty, a comment or a section header SHALL be rejected.

Each entry SHALL be written in the standard form, whatever its spacing on the command line: a reference as `<slug>@<version> <amount> <unit>`, with the item's default unit when none was given, and an inline entry as `"<description>" <nutrient>=<number> ...`, with its nutrients in catalog order. The same item MAY be given in several entries, and each becomes its own line.

#### Scenario: References and inline entries in one call
- **WHEN** `nomnom log breakfast --entry 'greek-yogurt 150 g' --entry 'apple@1 1 medium sized apple' --entry 'granola 40' --entry '"hotel coffee" kcal=5' --date 2026-09-30` runs, the latest versions are `greek-yogurt@3` and `granola@1`, and the base unit of `granola` is `g`
- **THEN** the lines `greek-yogurt@3 150 g`, `apple@1 1 medium sized apple`, `granola@1 40 g` and `"hotel coffee" kcal=5` are added to the `breakfast` section of `logs/2026/2026-09-30.nom`, in that order

#### Scenario: Standard form of an inline entry
- **WHEN** an entry is given as `'"ramen"   protein=35 kcal=800'` and the catalog lists `kcal` before `protein`
- **THEN** the line `"ramen" kcal=800 protein=35` is added

#### Scenario: Trailing comment
- **WHEN** an entry is given as `'apple 1 medium sized apple  # at work'`
- **THEN** the command fails with an error saying entries can't contain comments, and nothing is written

#### Scenario: Hash inside an inline description
- **WHEN** an entry is given as `'"ramen # spicy" kcal=800'`
- **THEN** the line `"ramen # spicy" kcal=800` is added

#### Scenario: Not an entry
- **WHEN** an entry is given as `'[lunch]'`
- **THEN** the command fails with an error naming the entry, and nothing is written

## MODIFIED Requirements

### Requirement: log command
`nomnom log` SHALL add one or more entries to a day file. It SHALL accept:
- `nomnom log <meal> <slug>[@<version>] <amount> [<unit> ...]` to add a reference entry; without a version, the latest version is pinned; the remaining positional words form the unit
- `nomnom log <meal> --inline <description> --<nutrient-id> <number> ...` to add an inline entry
- `nomnom log <meal> --entry <line> [--entry <line> ...]` to add one or more entries (repeatable), each written as defined in "Entries given with --entry"
- `--date <yyyy-mm-dd>` (optional; default: today's local date)

A call SHALL use exactly one of the three forms. Combining `--entry` with a positional entry, with `--inline` or with nutrient options SHALL fail without writing. All entries of a call SHALL go to the same meal and date.

The meal SHALL be one of the configured meals. The command SHALL validate every new entry by the same rules as a hand-written line, SHALL reject references to archived items, and SHALL refuse to write when the existing day file has errors, reporting them instead. Warnings about the existing day file, such as an unknown meal, SHALL be printed and SHALL NOT block logging.

A call SHALL add all of its entries or none of them. When any entry is invalid, the command SHALL fail without writing and SHALL report every invalid entry, each with its position among the `--entry` values and its text, not only the first. On success it SHALL print every line it added, one per line, in the order given.

#### Scenario: Log a reference with the latest version
- **WHEN** `nomnom log breakfast apple 1 medium sized apple --date 2026-09-29` runs and the latest version of `apple` is 2
- **THEN** the line `apple@2 1 medium sized apple` is added to the `breakfast` section of `logs/2026/2026-09-29.nom` and printed

#### Scenario: Log an inline entry
- **WHEN** `nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35` runs
- **THEN** the line `"restaurant ramen" kcal=800 protein=35` is added to today's `dinner` section, with nutrients in catalog order

#### Scenario: Log several entries
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'milk 200 ml'` runs and the latest versions are `oats@2` and `milk@1`
- **THEN** the lines `oats@2 60 g` and `milk@1 200 ml` are added to today's `breakfast` section, and standard output is exactly those two lines in that order

#### Scenario: Several invalid entries
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'granola 40 cup' --entry 'unicorn 1'` runs, `granola` has no `cup` unit and `unicorn` does not exist
- **THEN** the command fails, reports entry 2 `granola 40 cup` with the unit problem and entry 3 `unicorn 1` with the unknown item, and the day file is unchanged

#### Scenario: Archived item among several entries
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'old-bread 1 slice'` runs and `old-bread` is archived
- **THEN** the command fails, reports entry 2 as referencing an archived item, and nothing is written

#### Scenario: Unusable food version among several entries
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'apple@1 150 g'` runs, `kcal` is required and `apple@1` has no `kcal`
- **THEN** the command fails, reports entry 2 naming `apple@1` and `kcal`, and nothing is written

#### Scenario: --entry combined with a single-entry form
- **WHEN** `nomnom log breakfast apple 1 --entry 'oats 60 g'` or `nomnom log breakfast --inline 'tea' --kcal 2 --entry 'oats 60 g'` runs
- **THEN** the command fails with an error saying `--entry` can't be combined with a positional entry or `--inline`, and nothing is written

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

When `nomnom log` adds entries, only their lines SHALL be inserted, together and in the order given, at one point: right after the last entry or comment line of the meal's last section. When the meal has no section, a new section with the entries SHALL be inserted before the first section whose meal comes later in the configured order (unknown meals count as later than all configured ones), or appended at the end of the file otherwise, separated from neighbouring content by a blank line. A new file SHALL contain the section header and the entries. The file SHALL end with a newline.

#### Scenario: Append to an existing section
- **WHEN** the file has `[breakfast]` with two entries followed by a blank line and `[lunch]`, and a breakfast entry is logged
- **THEN** the new line is inserted directly after the second breakfast entry, and all other lines, including comments and alignment, are unchanged

#### Scenario: Several entries into an existing section
- **WHEN** the file has `[breakfast]` with the entry `eggs@2 2` and the comment `# before the run`, followed by a blank line and `[lunch]`, and two breakfast entries are logged in one call
- **THEN** both lines are inserted directly after `# before the run`, in the order given, followed by the blank line and `[lunch]`

#### Scenario: New section in configured order
- **WHEN** the file has only `[breakfast]` and `[dinner]` sections and a lunch entry is logged
- **THEN** a `[lunch]` section with the entry is inserted between them, separated by blank lines

#### Scenario: New section with several entries
- **WHEN** the file has only `[breakfast]` and `[dinner]` sections and three lunch entries are logged in one call
- **THEN** a `[lunch]` section with the three lines in the order given is inserted between them, separated by blank lines

#### Scenario: First entry of the day
- **WHEN** no file exists for the date and a snack entry is logged
- **THEN** the file is created with `[snack]` and the entry

### Requirement: Dry run of log
`nomnom log` SHALL accept `--dry-run`, with the behaviour and output defined by the `cli` spec. It SHALL print the lines it would add, as a real run does, and preview the day file: a new file with its section header and entries, or the lines it would insert into the existing file with up to two unchanged lines before and after them. Warnings about the existing day file SHALL be printed as in a real run, and a day file with errors or an invalid entry SHALL fail the dry run as it fails a real run.

#### Scenario: Dry run into an existing section
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast apple 150 g --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `apple@2 150 g`, the line as a real run prints it, then the preview of `logs/2026/2026-09-30.nom` with `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ apple@2 150 g`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of several entries
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast --entry 'apple 150 g' --entry '"coffee" kcal=5' --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `apple@2 150 g` and `"coffee" kcal=5`, then the preview of `logs/2026/2026-09-30.nom` shows `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ apple@2 150 g` and `+ "coffee" kcal=5`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of the first entry of the day
- **WHEN** no day file exists for 2026-09-30 and `nomnom log snack --inline 'cookie' --kcal 120 --date 2026-09-30 --dry-run` runs
- **THEN** the preview shows `logs/2026/2026-09-30.nom` as a new file with `+ [snack]` and `+ "cookie" kcal=120`, and neither the file nor `logs/2026/` is created

#### Scenario: Dry run against a day file with errors
- **WHEN** the day file contains an invalid line and `nomnom log breakfast apple 150 g --dry-run` runs for that day
- **THEN** the command fails and reports the existing errors, as without `--dry-run`

#### Scenario: Dry run with an invalid entry
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'unicorn 1' --dry-run` runs and `unicorn` does not exist
- **THEN** the command fails and reports entry 2, as without `--dry-run`, and no preview is printed
