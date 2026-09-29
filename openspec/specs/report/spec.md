# report Specification

## Purpose

Defines `nomnom report`, which shows what was eaten on a day or over a date range, with per-meal, per-day and range totals and averages. It calculates them from the day files' entries, as text for people or JSON for agents.

## Requirements

### Requirement: report command
`nomnom report` SHALL accept:
- `[<from> [<to>]]`: optional dates as `yyyy-mm-dd`
- `--entries` (flag): in a range report, include each day's entries
- `--json` (flag): print the report as JSON instead of text

With no date, the command SHALL report today's local date as a day report. With one date, it SHALL produce a day report for that date. With two dates, it SHALL produce a range report from `<from>` to `<to>` inclusive, even when both dates are equal. Each date SHALL be a real calendar date, and `<to>` SHALL NOT be before `<from>`. `--entries` SHALL have no effect on a day report. The command SHALL NOT create or modify day files, foods or recipes.

#### Scenario: No date
- **WHEN** `nomnom report` runs on 2026-09-29
- **THEN** it prints the day report for 2026-09-29

#### Scenario: Two dates
- **WHEN** `nomnom report 2026-09-23 2026-09-29` runs
- **THEN** it prints a range report covering the seven dates from 2026-09-23 to 2026-09-29

#### Scenario: Invalid date
- **WHEN** `nomnom report 2026-02-30` runs
- **THEN** the command fails with an error naming `2026-02-30`, and the exit status is 1

#### Scenario: End before start
- **WHEN** `nomnom report 2026-09-29 2026-09-23` runs
- **THEN** the command fails with an error saying that the end date is before the start date, and the exit status is 1

### Requirement: Entry nutrients
Every entry of a day file SHALL contribute a value for every nutrient in the current catalog:
- A reference entry SHALL contribute the nutrients of its amount and unit of the pinned food or recipe version, using the item's default unit when the line gives none. A recipe's nutrients SHALL be calculated from its ingredients, including nested recipes, by the rules of the recipes capability.
- An inline entry SHALL contribute its typed-in values, with absent nutrients counting as 0.

A meal's total SHALL be the sum of its entries, a day's total the sum of all its entries, and a range total the sum of its days' totals. Values SHALL be calculated with full precision and rounded only when printed.

#### Scenario: Reference and inline entries
- **WHEN** a day file has `[lunch]` with `chicken-soup@1 1 serving`, where one serving of `chicken-soup@1` is 136.255 kcal, and `[dinner]` with `"restaurant ramen" kcal=800 protein=35`
- **THEN** lunch totals 136.255 kcal, dinner totals 800 kcal and 35 g protein with 0 of every other nutrient, and the day totals 936.255 kcal

#### Scenario: Nested recipe
- **WHEN** a day has the entry `soup@1 500 g`, `soup@1` has a yield of 1000 g, and one of its ingredients is the recipe `chicken-stock@1`
- **THEN** the entry contributes half of the total nutrients of `soup@1`, with those of `chicken-stock@1` included in proportion

#### Scenario: Reference without a unit
- **WHEN** a day has the entry `rice@1 80` and the base unit of `rice@1` is `g`
- **THEN** the entry contributes the nutrients of 80 g of `rice@1`

### Requirement: Meal order
A report SHALL list a day's meals in the configured order, followed by meals that are not configured, in the order in which they first appear in the file. Entries within a meal SHALL keep their order in the file, with duplicate sections merged. Meals without entries SHALL be omitted.

#### Scenario: Sections out of order
- **WHEN** a day file has a `[dinner]` section followed by a `[lunch]` section, and the configured meals are `breakfast`, `lunch`, `dinner`, `snack`
- **THEN** the report lists lunch before dinner

#### Scenario: Empty section
- **WHEN** a day file has a `[breakfast]` header with no entries and a `[lunch]` section with one entry
- **THEN** the report lists only lunch

### Requirement: Day report
A text day report SHALL show:
- the date
- a header that names every catalog nutrient in catalog order, with its unit
- each meal with its entries and a total line
- a day total line

Each entry line SHALL show a reference entry's item display name with its amount and unit, or an inline entry's description in double quotes. Every entry and total line SHALL show a value for every catalog nutrient, zeros included, rounded to one decimal place. When nothing is logged for the date, because its file is missing or has no entries, the report SHALL say that nothing was logged, and the command SHALL succeed.

#### Scenario: Day with entries
- **WHEN** `nomnom report 2026-09-29` runs and that day has `apple@2 1 medium sized apple` under `[breakfast]`, where `apple@2` is named `Apple`
- **THEN** the output shows 2026-09-29, a breakfast group with a line for `Apple` with `1 medium sized apple` and its nutrients, a breakfast total, and the day total

#### Scenario: Inline entry
- **WHEN** a day has `"restaurant ramen" kcal=800 protein=35` under `[dinner]`
- **THEN** the dinner group shows an entry line for `"restaurant ramen"` with 800.0 kcal, 35.0 g protein and 0.0 for every other nutrient

#### Scenario: Nothing logged
- **WHEN** `nomnom report 2026-09-20` runs and `logs/2026/2026-09-20.nom` does not exist
- **THEN** the output says that nothing was logged on 2026-09-20, and the exit status is 0

### Requirement: Range report
A text range report SHALL show:
- a header that names every catalog nutrient in catalog order, with its unit
- one row per date in the range, in date order, with that day's totals, or a marker that nothing was logged
- a total row with the range total and the number of logged days
- an average row with the average per logged day and the number of days it covers out of the days in the range, saying so when today was left out

Values SHALL be rounded to one decimal place. With `--entries`, the report SHALL first show the day report of each logged day in the range, in date order.

#### Scenario: Range with days not logged
- **WHEN** `nomnom report 2026-09-23 2026-09-26` runs and only 2026-09-23 and 2026-09-25 have entries
- **THEN** the output has four date rows, the rows for 2026-09-24 and 2026-09-26 show that nothing was logged, and the total row says 2 logged days

#### Scenario: Range with entries
- **WHEN** `nomnom report 2026-09-23 2026-09-26 --entries` runs and only 2026-09-23 and 2026-09-25 have entries
- **THEN** the output shows the day reports of 2026-09-23 and 2026-09-25, followed by the range rows, the total and the average

### Requirement: Averages
A logged day SHALL be a date whose day file has at least one entry. The average SHALL be the sum of the totals of the logged days it covers, divided by their number. When today's local date is in the range, today SHALL be left out of the average because the day may not be over, and SHALL still count in the range total. When no logged day remains, the report SHALL show no average.

#### Scenario: Average per logged day
- **WHEN** a range report covers 2026-09-20 to 2026-09-22, today is 2026-09-29, and the logged days total 2000 kcal and 1800 kcal with 2026-09-21 not logged
- **THEN** the average is 1900 kcal, covering 2 of 3 days

#### Scenario: Today in the range
- **WHEN** a range report covers 2026-09-23 to 2026-09-29 on 2026-09-29, and 2026-09-23, 2026-09-25, 2026-09-26, 2026-09-28 and 2026-09-29 are logged
- **THEN** the total includes all five logged days, the average covers the 4 logged days other than 2026-09-29, and the output says that today was left out of the average

#### Scenario: Only today logged
- **WHEN** a range report covers 2026-09-27 to 2026-09-29 on 2026-09-29, and only 2026-09-29 is logged
- **THEN** the total is today's total and the report shows no average

### Requirement: JSON output
With `--json`, the command SHALL print one JSON document to standard output, with the same shape for day and range reports:
- `from` and `to`: the reported dates, equal for a day report
- `nutrients`: every catalog nutrient in catalog order, as `id`, `name` and `unit`
- `days`: one object per date in the range, in date order, with `date`, `file` (the day file path, as in problem locations), `logged`, `meals` and `totals`
- each meal: `meal`, `configured` (whether it is in the configuration), `totals`, and `entries` in a day report or with `--entries`
- each entry: `line` (its line number in the day file) and `kind`; a reference entry also has `slug`, `version`, `item` (`food` or `recipe`), `name`, `amount` and `unit` (the default unit when the line gives none); an inline entry has `description`; every entry has `nutrients`
- `loggedDays`: the number of logged days
- `totals`: the range total
- `averageDays`: the dates the average covers
- `average`: the average per logged day, or `null` when there is none
- `warnings`: every warning, as `file`, `line` and `message`

Every nutrient value set (`nutrients` of an entry and each `totals` and `average`) SHALL be an object keyed by nutrient id with a value for every catalog nutrient, zeros included, rounded to two decimal places. A date with nothing logged SHALL have `logged: false`, no meals and zero totals.

#### Scenario: Day report as JSON
- **WHEN** `nomnom report 2026-09-29 --json` runs and that day has `"restaurant ramen" kcal=800 protein=35` on line 2 under `[dinner]`
- **THEN** standard output is one JSON document with `from` and `to` equal to `2026-09-29`, and one day whose `dinner` meal has an inline entry with `line` 2, `description` `restaurant ramen` and `nutrients` `kcal` 800, `protein` 35 and 0 for every other catalog nutrient

#### Scenario: Range as JSON without entries
- **WHEN** `nomnom report 2026-09-23 2026-09-29 --json` runs
- **THEN** `days` has seven objects, each meal has `totals` but no `entries`, and `loggedDays`, `totals`, `averageDays` and `average` describe the range

#### Scenario: Nothing logged as JSON
- **WHEN** `nomnom report 2026-09-20 --json` runs and nothing is logged that day
- **THEN** the day has `logged: false`, an empty `meals` list and zero totals, `average` is `null`, and the exit status is 0

### Requirement: Invalid days fail the report
A report SHALL be produced only when every day in its range is valid and every entry can be calculated. Otherwise the command SHALL print nothing on standard output, SHALL report every problem found in every day of the range, and SHALL exit with status 1. Day files SHALL be checked by the rules of the daily-log capability. A problem found while calculating an entry, such as a recipe cycle or a nested recipe that references a missing version, SHALL be located at the entry's line in the day file, and its message SHALL name the recipe where it was found.

#### Scenario: Invalid days in a range
- **WHEN** `nomnom report 2026-09-01 2026-09-30` runs, `2026-09-10.nom` has an error on line 4, and `2026-09-17.nom` has errors on lines 2 and 6
- **THEN** standard error lists all three problems with their files and line numbers, standard output is empty, and the exit status is 1

#### Scenario: Recipe cycle found while calculating
- **WHEN** line 3 of a day file is `a@1 1 serving`, and hand-edited recipe files make `a@1` reference `b@1` and `b@1` reference `a@1`
- **THEN** the report fails with a problem located at line 3 of that day file whose message names the cycle between `a@1` and `b@1`

#### Scenario: JSON with an invalid day
- **WHEN** `nomnom report 2026-09-10 --json` runs and that day has an error
- **THEN** standard output is empty, the problem is on standard error, and the exit status is 1

### Requirement: Unknown meals in a report
Sections for meals that are not in the configuration SHALL be included in the report and its totals, and each SHALL be reported as a warning. Warnings SHALL be printed to standard error as `warning: <file>:<line>: <message>`, SHALL be included in the JSON output, and SHALL NOT make the command fail.

#### Scenario: Unknown meal
- **WHEN** `nomnom report 2026-09-29` runs, that day has a `[brunch]` section with one entry, and `brunch` is not a configured meal
- **THEN** brunch is listed after the configured meals, its entry counts in the day total, standard error has a warning naming `brunch`, and the exit status is 0
