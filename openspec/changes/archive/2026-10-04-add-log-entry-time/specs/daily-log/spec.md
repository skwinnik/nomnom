# Spec Delta

## ADDED Requirements

### Requirement: Entry times
An entry MAY have a time, given only by the time prefix of its line (see "Line types"). The time SHALL be a local wall-clock time on the date of the day file that contains the entry. No time zone or UTC offset SHALL be stored with it, and a time SHALL NOT be converted, adjusted or moved to another date, for example when the user's time zone changes. A time that is skipped or that occurs twice on that date because of a daylight saving time change SHALL be accepted and kept exactly as written.

An entry without a time prefix SHALL have no time. The system SHALL NOT give it one, whether from its meal, its position, its neighbouring entries, the current time or anything else.

Times SHALL NOT affect the order of entries: entries SHALL keep their file order within a meal, as without times. Times within a meal need not increase, several entries MAY have the same time, timed and untimed entries MAY be mixed in one section, and a time need not match its meal.

#### Scenario: Times keep the file order
- **WHEN** a file has `[breakfast]` with the lines `09:00 coffee@1 1 cup`, `07:30 oats@2 60 g` and `milk@1 200 ml`, in that order
- **THEN** breakfast has three entries in that order: `coffee@1` at 09:00, `oats@2` at 07:30 and `milk@1` without a time

#### Scenario: Time that doesn't match the meal
- **WHEN** a file has `[breakfast]` with the line `23:30 "late cereal" kcal=300`
- **THEN** the file is valid and the entry stays in breakfast with the time 23:30

#### Scenario: Start and end of the day
- **WHEN** the file `logs/2026/2026-09-29.nom` has the lines `00:00 "midnight snack" kcal=150` and `23:59 "tea" kcal=2` under `[snack]`
- **THEN** both entries are on 2026-09-29, at 00:00 and 23:59

#### Scenario: Time skipped by a daylight saving change
- **WHEN** local clocks jump from 02:00 to 03:00 on the date of a day file, and the file has the line `02:30 "bottle of milk" kcal=120`
- **THEN** the file is valid and the entry has the time 02:30, unchanged

#### Scenario: Time repeated by a daylight saving change
- **WHEN** local clocks go back from 03:00 to 02:00 on the date of a day file, and the file has the lines `02:15 "tea" kcal=2` and `02:45 "biscuit" kcal=60`
- **THEN** the file is valid and the entries have the times 02:15 and 02:45 as written, in file order

#### Scenario: Untimed entry gets no time
- **WHEN** a file has the line `apple@2 1 medium sized apple` under `[breakfast]`
- **THEN** the entry has no time, whatever the date of the file and the current time

## MODIFIED Requirements

### Requirement: Line types
A day file SHALL be a sequence of lines. Leading and trailing whitespace on a line SHALL be ignored.

A line MAY start with a time prefix: a time followed by whitespace. A time SHALL be `HH:MM`: a two-digit hour from `00` to `23`, a colon, and a two-digit minute from `00` to `59`. Nothing else SHALL be a time, for example `8:15`, `24:00`, `12:60`, `08:15:30` or `8:15pm`. A line with a time prefix SHALL be an entry line: the rest of the line after the whitespace SHALL be an inline entry when it starts with `"` and a reference entry otherwise, and the entry SHALL have that time (see "Entry times"). A line SHALL have at most one time prefix.

On a line without a time prefix, the first remaining character SHALL determine the line type:
- empty line: blank
- `#`: comment, ignored
- `[`: section header `[<meal>]`
- `"`: inline entry
- anything else: reference entry

A line whose first whitespace-separated word starts with one or more digits followed by `:` SHALL be time-like. A time-like line that is not a valid time prefix followed by a reference or inline entry SHALL be a validation error naming the file and line number; it SHALL NOT be read as a reference whose slug contains that word. This includes a malformed time, a time not followed by whitespace, and a valid time followed by nothing, a comment, a section header or another time. A line whose first word is not time-like SHALL be read as it is without times, so a reference whose slug starts with digits stays a valid untimed reference.

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

#### Scenario: Example day with times
- **WHEN** a file contains:
  ```
  [breakfast]
  07:45 greek-yogurt-2-460123@1  150 g
  apple@2                        1 medium sized apple

  [dinner]
  19:30 "restaurant ramen"       kcal=800 protein=35  # with friends
  ```
- **THEN** it parses into a `breakfast` section with a reference entry at 07:45 and an untimed reference entry, and a `dinner` section with one inline entry at 19:30

#### Scenario: Malformed time
- **WHEN** a file has, on separate lines under `[breakfast]`, `8:15 apple@2 1 medium sized apple`, `24:00 apple@2 1 medium sized apple`, `12:60 apple@2 1 medium sized apple`, `08:15:30 apple@2 1 medium sized apple`, `08:15apple@2 1 medium sized apple` and `12:30"ramen" kcal=800`
- **THEN** validation fails with one error per line, each naming the file and the line number

#### Scenario: Time without an entry
- **WHEN** a file has, on separate lines under `[snack]`, `08:15`, `08:15  # coffee`, `08:15 [lunch]` and `08:15 09:00 apple@2 1`
- **THEN** validation fails with one error per line, each naming the file and the line number

#### Scenario: Slug starting with digits
- **WHEN** a file has `7up@1 1 can` under `[snack]`
- **THEN** it is an untimed reference entry for version 1 of `7up`, as without times

### Requirement: Reference entries
A reference entry SHALL have the form `[<time> ]<slug>@<version> <amount> [<unit>]`, with tokens separated by whitespace, where `<time> ` is the optional time prefix defined in "Line types". The time prefix SHALL NOT be part of the slug, amount or unit and SHALL NOT change how they are read. The version is required. The amount SHALL be a positive number. The unit is the rest of the line after the amount (excluding a trailing comment), normalised like unit names; when absent, the item's default unit is used (as for recipe ingredients). The slug SHALL resolve to a food or recipe in the shared namespace, the version SHALL exist, and the unit SHALL be allowed by that version. When the version is a food version, it SHALL be usable (see the foods capability).

#### Scenario: Pinned reference with a multi-word unit
- **WHEN** a line reads `apple@2 1 medium sized apple`
- **THEN** it is an entry for version 2 of `apple`, amount 1, unit `medium sized apple`

#### Scenario: Timed reference with a multi-word unit
- **WHEN** a line reads `08:15 apple@2 1 medium sized apple`
- **THEN** it is an entry at 08:15 for version 2 of `apple`, amount 1, unit `medium sized apple`

#### Scenario: Timed reference with a slug starting with digits
- **WHEN** a line reads `18:00 7up@1 1 can`
- **THEN** it is an entry at 18:00 for version 1 of `7up`, amount 1, unit `can`

#### Scenario: Reference without a version
- **WHEN** a line reads `apple 1 medium sized apple`
- **THEN** parsing fails with an error naming the line number and explaining that a version is required

#### Scenario: Timed reference without a version
- **WHEN** a line reads `08:15 apple 1 medium sized apple`
- **THEN** parsing fails with an error naming the line number and explaining that a version is required

#### Scenario: Unit not allowed
- **WHEN** a line reads `apple@2 1 cup` and `apple@2` has no `cup` unit
- **THEN** validation fails with an error naming the line number and the unit

#### Scenario: Unusable food version
- **WHEN** a line reads `apple@1 150 g`, `kcal` is required and `apple@1` has no `kcal`
- **THEN** validation fails with an error naming the line number, `apple@1` and `kcal`

### Requirement: Inline entries
An inline entry SHALL have the form `[<time> ]"<description>" <nutrient>=<number> ...`, where `<time> ` is the optional time prefix defined in "Line types". The description SHALL be non-empty and SHALL NOT contain `"`. Text inside the description SHALL NOT be read as a time. The entry SHALL contain at least one nutrient value, and every key SHALL be a nutrient id in the catalog, given at most once, with a non-negative number. Required nutrients SHALL be present. The values are the totals consumed; an inline entry has no amount or unit. Absent nutrients SHALL count as 0.

#### Scenario: Valid inline entry
- **WHEN** a line reads `"restaurant ramen" kcal=800 protein=35`
- **THEN** it is an inline entry contributing 800 kcal, 35 g protein and 0 of every other nutrient

#### Scenario: Timed inline entry
- **WHEN** a line reads `12:30 "restaurant ramen" kcal=800 protein=35`
- **THEN** it is an inline entry at 12:30 contributing 800 kcal, 35 g protein and 0 of every other nutrient

#### Scenario: Time inside a description
- **WHEN** a line reads `"lunch at 12:30" kcal=500`
- **THEN** it is an untimed inline entry with the description `lunch at 12:30`

#### Scenario: Key that is not a nutrient
- **WHEN** a line reads `"ramen" kcal=800 weight=300`
- **THEN** validation fails with an error naming the line number and `weight`

#### Scenario: Required nutrient missing
- **WHEN** a line reads `"ramen" protein=35` and `kcal` is required
- **THEN** validation fails with an error naming the line number and `kcal`

#### Scenario: Amount and unit instead of nutrients
- **WHEN** a line reads `"ramen" 300 g`
- **THEN** validation fails with an error naming the line number

### Requirement: log command
`nomnom log` SHALL add one or more entries to a day file. It SHALL accept:
- `nomnom log <meal> <slug>[@<version>] <amount> [<unit> ...]` to add a reference entry; without a version, the latest version is pinned; the remaining positional words form the unit
- `nomnom log <meal> --inline <description> --<nutrient-id> <number> ...` to add an inline entry
- `nomnom log <meal> --entry <line> [--entry <line> ...]` to add one or more entries (repeatable), each written as defined in "Entries given with --entry"
- `--date <yyyy-mm-dd>` (optional; default: today's local date)
- `--time <HH:MM>` (optional): the time of the added entries, in the time format of day files (see "Line types"); with the positional or `--inline` form, the entry gets this time; with `--entry`, every value without its own time prefix gets it, as defined in "Entries given with --entry"

A call SHALL use exactly one of the three forms. Combining `--entry` with a positional entry, with `--inline` or with nutrient options SHALL fail without writing. `--date` and `--time` MAY be used with every form. All entries of a call SHALL go to the same meal and date.

An added entry SHALL have a time only when the call gives one, with `--time` or with a time prefix on an `--entry` value. The command SHALL NOT add the current time or any other time on its own, whether the date is today, a past date or a future date. A `--time` value that is not a valid time SHALL fail the command without writing, with an error naming the value. The positional and `--inline` forms SHALL take a time only from `--time`: a time-like first positional word after the meal SHALL be rejected with an error saying that the time is given with `--time`, and an `--inline` description SHALL be kept as text even when it looks like a time. A timed entry SHALL be written as its time, one space and the entry in its standard form; an untimed entry SHALL be written without a time.

The meal SHALL be one of the configured meals. The command SHALL validate every new entry by the same rules as a hand-written line, SHALL reject references to archived items, and SHALL refuse to write when the existing day file has errors, reporting them instead. Warnings about the existing day file, such as an unknown meal, SHALL be printed and SHALL NOT block logging.

A call SHALL add all of its entries or none of them. When any entry is invalid, including an entry whose time conflicts with `--time`, the command SHALL fail without writing and SHALL report every invalid entry, each with its position among the `--entry` values and its text, not only the first. On success it SHALL print every line it added, as written to the day file and including its time, one per line, in the order given.

#### Scenario: Log a reference with the latest version
- **WHEN** `nomnom log breakfast apple 1 medium sized apple --date 2026-09-29` runs and the latest version of `apple` is 2
- **THEN** the line `apple@2 1 medium sized apple` is added to the `breakfast` section of `logs/2026/2026-09-29.nom` and printed

#### Scenario: Log a reference with a time
- **WHEN** `nomnom log breakfast apple 1 medium sized apple --time 08:15 --date 2026-09-29` runs and the latest version of `apple` is 2
- **THEN** the line `08:15 apple@2 1 medium sized apple` is added to the `breakfast` section of `logs/2026/2026-09-29.nom` and printed

#### Scenario: Log an inline entry
- **WHEN** `nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35` runs
- **THEN** the line `"restaurant ramen" kcal=800 protein=35` is added to today's `dinner` section, with nutrients in catalog order

#### Scenario: Log an inline entry with a time
- **WHEN** `nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35 --time 19:30` runs
- **THEN** the line `19:30 "restaurant ramen" kcal=800 protein=35` is added to today's `dinner` section and printed

#### Scenario: No automatic time
- **WHEN** `nomnom log breakfast apple 1 medium sized apple` runs at 08:15 for today, or `nomnom log breakfast apple 1 medium sized apple --date 2026-09-20` runs on a later date, and the latest version of `apple` is 2
- **THEN** the line `apple@2 1 medium sized apple` is added, without a time

#### Scenario: Invalid --time value
- **WHEN** `nomnom log breakfast apple 1 --time 8:15`, `--time 24:00` or `--time 12:60` runs
- **THEN** the command fails with an error naming the value, and nothing is written

#### Scenario: Time as a positional word
- **WHEN** `nomnom log breakfast 08:15 apple 1` runs
- **THEN** the command fails with an error saying that the time is given with `--time`, and nothing is written

#### Scenario: Time-like text in an inline description
- **WHEN** `nomnom log lunch --inline '12:30 ramen' --kcal 800` runs
- **THEN** the line `"12:30 ramen" kcal=800` is added, without a time

#### Scenario: Log several entries
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'milk 200 ml'` runs and the latest versions are `oats@2` and `milk@1`
- **THEN** the lines `oats@2 60 g` and `milk@1 200 ml` are added to today's `breakfast` section, and standard output is exactly those two lines in that order

#### Scenario: Log several entries with one time
- **WHEN** `nomnom log breakfast --time 07:45 --entry 'oats 60 g' --entry 'milk 200 ml'` runs and the latest versions are `oats@2` and `milk@1`
- **THEN** the lines `07:45 oats@2 60 g` and `07:45 milk@1 200 ml` are added to today's `breakfast` section, and standard output is exactly those two lines in that order

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

### Requirement: Entries given with --entry
Each `--entry` value of `nomnom log` SHALL be written like an entry line of a day file, with leading and trailing whitespace ignored, and MAY start with a time prefix as defined in "Line types":
- a reference `[<time> ]<slug>[@<version>] <amount> [<unit>]`, where, unlike in a day file, the version is optional; without it, the latest version is pinned
- an inline entry `[<time> ]"<description>" <nutrient>=<number> ...`

Every value SHALL follow the rules of a hand-written entry line of its type, including the time format and the rejection of time-like words that are not a valid time prefix. A value SHALL NOT contain a comment: a `#` outside the quoted description of an inline entry SHALL be rejected. A value that is empty, a comment, a section header or a time without an entry SHALL be rejected.

A value with a time prefix SHALL get that time. When `--time` is not given, a value without a time prefix SHALL be untimed. When `--time` is given, every value without a time prefix SHALL get the `--time` time, and every value with its own time prefix SHALL conflict with `--time`, even when both times are equal. A conflicting value SHALL be an invalid entry: it SHALL be reported with its position and text, together with every other invalid entry of the call, and nothing SHALL be written.

Each entry SHALL be written in the standard form, whatever its spacing on the command line: a reference as `<slug>@<version> <amount> <unit>`, with the item's default unit when none was given, and an inline entry as `"<description>" <nutrient>=<number> ...`, with its nutrients in catalog order. A timed entry SHALL be written as `<HH:MM> ` followed by that standard form; an untimed entry SHALL be written as the standard form alone. The same item MAY be given in several entries, and each becomes its own line.

#### Scenario: References and inline entries in one call
- **WHEN** `nomnom log breakfast --entry 'greek-yogurt 150 g' --entry 'apple@1 1 medium sized apple' --entry 'granola 40' --entry '"hotel coffee" kcal=5' --date 2026-09-30` runs, the latest versions are `greek-yogurt@3` and `granola@1`, and the base unit of `granola` is `g`
- **THEN** the lines `greek-yogurt@3 150 g`, `apple@1 1 medium sized apple`, `granola@1 40 g` and `"hotel coffee" kcal=5` are added to the `breakfast` section of `logs/2026/2026-09-30.nom`, in that order

#### Scenario: Timed and untimed entries in one call
- **WHEN** `nomnom log breakfast --entry '07:30 oats 60 g' --entry 'milk 200 ml' --entry '08:10 "hotel coffee" kcal=5'` runs and the latest versions are `oats@2` and `milk@1`
- **THEN** the lines `07:30 oats@2 60 g`, `milk@1 200 ml` and `08:10 "hotel coffee" kcal=5` are added to today's `breakfast` section, in that order

#### Scenario: Standard form of an inline entry
- **WHEN** an entry is given as `'"ramen"   protein=35 kcal=800'` and the catalog lists `kcal` before `protein`
- **THEN** the line `"ramen" kcal=800 protein=35` is added

#### Scenario: Standard form of a timed entry
- **WHEN** an entry is given as `'  08:15    apple   1 medium sized apple '` and the latest version of `apple` is 2
- **THEN** the line `08:15 apple@2 1 medium sized apple` is added

#### Scenario: Slug starting with digits
- **WHEN** an entry is given as `'7up 1 can'` and the latest version of `7up` is 1
- **THEN** the line `7up@1 1 can` is added, without a time

#### Scenario: Conflicting times
- **WHEN** `nomnom log breakfast --time 08:00 --entry '07:30 oats 60 g' --entry 'milk 200 ml' --entry '08:00 coffee 1 cup' --entry 'granola 40 cup'` runs and `granola` has no `cup` unit
- **THEN** the command fails, reports entry 1 `07:30 oats 60 g` and entry 3 `08:00 coffee 1 cup` as already having a time that conflicts with `--time`, and entry 4 `granola 40 cup` with the unit problem, does not report entry 2, and the day file is unchanged

#### Scenario: Malformed time in an entry
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry '8:15 milk 200 ml'` runs
- **THEN** the command fails, reports entry 2 `8:15 milk 200 ml` with an invalid time, and nothing is written

#### Scenario: Time without an entry
- **WHEN** an entry is given as `'08:15'`
- **THEN** the command fails with an error naming the entry, and nothing is written

#### Scenario: Trailing comment
- **WHEN** an entry is given as `'apple 1 medium sized apple  # at work'`
- **THEN** the command fails with an error saying entries can't contain comments, and nothing is written

#### Scenario: Hash inside an inline description
- **WHEN** an entry is given as `'"ramen # spicy" kcal=800'`
- **THEN** the line `"ramen # spicy" kcal=800` is added

#### Scenario: Not an entry
- **WHEN** an entry is given as `'[lunch]'`
- **THEN** the command fails with an error naming the entry, and nothing is written

### Requirement: Writing preserves existing content
When the system writes to an existing day file, every existing line SHALL be kept exactly as it was.

When `nomnom log` adds entries, only their lines SHALL be inserted, together and in the order given, at one point: right after the last entry or comment line of the meal's last section. When the meal has no section, a new section with the entries SHALL be inserted before the first section whose meal comes later in the configured order (unknown meals count as later than all configured ones), or appended at the end of the file otherwise, separated from neighbouring content by a blank line. A new file SHALL contain the section header and the entries. The file SHALL end with a newline.

The times of new and existing entries SHALL NOT change where lines are inserted, and existing entries SHALL NOT be moved or sorted by time.

#### Scenario: Append to an existing section
- **WHEN** the file has `[breakfast]` with two entries followed by a blank line and `[lunch]`, and a breakfast entry is logged
- **THEN** the new line is inserted directly after the second breakfast entry, and all other lines, including comments and alignment, are unchanged

#### Scenario: Several entries into an existing section
- **WHEN** the file has `[breakfast]` with the entry `eggs@2 2` and the comment `# before the run`, followed by a blank line and `[lunch]`, and two breakfast entries are logged in one call
- **THEN** both lines are inserted directly after `# before the run`, in the order given, followed by the blank line and `[lunch]`

#### Scenario: Earlier time logged after a later one
- **WHEN** the file has `[breakfast]` with the entry `09:00 coffee@1 1 cup`, and `nomnom log breakfast oats 60 g --time 07:30` runs for that day and the latest version of `oats` is 2
- **THEN** the line `07:30 oats@2 60 g` is inserted directly after `09:00 coffee@1 1 cup`, and no line is moved

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
`nomnom log` SHALL accept `--dry-run`, with the behaviour and output defined by the `cli` spec. It SHALL print the lines it would add, as a real run does, including their times, and preview the day file: a new file with its section header and entries, or the lines it would insert into the existing file with up to two unchanged lines before and after them. Previewed lines SHALL be exactly the lines a real run writes. Warnings about the existing day file SHALL be printed as in a real run, and a day file with errors, an invalid entry or an invalid or conflicting time SHALL fail the dry run as it fails a real run.

#### Scenario: Dry run into an existing section
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast apple 150 g --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `apple@2 150 g`, the line as a real run prints it, then the preview of `logs/2026/2026-09-30.nom` with `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ apple@2 150 g`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of several entries
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast --entry 'apple 150 g' --entry '"coffee" kcal=5' --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `apple@2 150 g` and `"coffee" kcal=5`, then the preview of `logs/2026/2026-09-30.nom` shows `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ apple@2 150 g` and `+ "coffee" kcal=5`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of timed entries
- **WHEN** the day file for 2026-09-30 has `[breakfast]` with the entries `oats@2 60 g` and `milk@1 200 ml`, followed by a blank line and `[lunch]`, and `nomnom log breakfast --entry '08:15 apple 150 g' --entry '"coffee" kcal=5' --date 2026-09-30 --dry-run` runs and the latest version of `apple` is 2
- **THEN** the output starts with `08:15 apple@2 150 g` and `"coffee" kcal=5`, then the preview of `logs/2026/2026-09-30.nom` shows `oats@2 60 g` and `milk@1 200 ml` prefixed with two spaces, `+ 08:15 apple@2 150 g` and `+ "coffee" kcal=5`, then the blank line and `[lunch]` prefixed with two spaces, and the day file is unchanged

#### Scenario: Dry run of the first entry of the day
- **WHEN** no day file exists for 2026-09-30 and `nomnom log snack --inline 'cookie' --kcal 120 --date 2026-09-30 --dry-run` runs
- **THEN** the preview shows `logs/2026/2026-09-30.nom` as a new file with `+ [snack]` and `+ "cookie" kcal=120`, and neither the file nor `logs/2026/` is created

#### Scenario: Timed dry run of the first entry of the day
- **WHEN** no day file exists for 2026-09-30 and `nomnom log snack --inline 'cookie' --kcal 120 --time 16:00 --date 2026-09-30 --dry-run` runs
- **THEN** the output starts with `16:00 "cookie" kcal=120`, the preview shows `logs/2026/2026-09-30.nom` as a new file with `+ [snack]` and `+ 16:00 "cookie" kcal=120`, and neither the file nor `logs/2026/` is created

#### Scenario: Dry run against a day file with errors
- **WHEN** the day file contains an invalid line and `nomnom log breakfast apple 150 g --dry-run` runs for that day
- **THEN** the command fails and reports the existing errors, as without `--dry-run`

#### Scenario: Dry run with an invalid entry
- **WHEN** `nomnom log breakfast --entry 'oats 60 g' --entry 'unicorn 1' --dry-run` runs and `unicorn` does not exist
- **THEN** the command fails and reports entry 2, as without `--dry-run`, and no preview is printed

#### Scenario: Dry run with a conflicting time
- **WHEN** `nomnom log breakfast --time 08:00 --entry 'oats 60 g' --entry '08:00 milk 200 ml' --dry-run` runs
- **THEN** the command fails and reports entry 2 `08:00 milk 200 ml` as conflicting with `--time`, as without `--dry-run`, and no preview is printed
