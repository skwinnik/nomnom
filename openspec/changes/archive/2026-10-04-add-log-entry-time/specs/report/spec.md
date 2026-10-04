# Spec Delta

## MODIFIED Requirements

### Requirement: Day report
A text day report SHALL show:
- the date
- a header that names every catalog nutrient in catalog order, with its unit
- each meal with its entries and a total line
- a day total line

Each entry line SHALL show a reference entry's item display name with its amount and unit, or an inline entry's description in double quotes. When the entry has a time (see the daily-log capability), its line SHALL show the time as `HH:MM` before the name or description. An untimed entry's line SHALL show no time and no placeholder for one, and its text SHALL be the same as without entry times. Entries SHALL be shown in file order, whatever their times. Every entry and total line SHALL show a value for every catalog nutrient, zeros included, rounded to one decimal place. Times SHALL NOT change any value or total. When nothing is logged for the date, because its file is missing or has no entries, the report SHALL say that nothing was logged, and the command SHALL succeed.

#### Scenario: Day with entries
- **WHEN** `nomnom report 2026-09-29` runs and that day has `apple@2 1 medium sized apple` under `[breakfast]`, where `apple@2` is named `Apple`
- **THEN** the output shows 2026-09-29, a breakfast group with a line for `Apple` with `1 medium sized apple` and its nutrients, a breakfast total, and the day total

#### Scenario: Inline entry
- **WHEN** a day has `"restaurant ramen" kcal=800 protein=35` under `[dinner]`
- **THEN** the dinner group shows an entry line for `"restaurant ramen"` with 800.0 kcal, 35.0 g protein and 0.0 for every other nutrient

#### Scenario: Timed entries
- **WHEN** `nomnom report 2026-09-29` runs and that day has `08:15 apple@2 1 medium sized apple` under `[breakfast]`, where `apple@2` is named `Apple`, and `19:30 "restaurant ramen" kcal=800 protein=35` under `[dinner]`
- **THEN** the breakfast line shows `08:15` before `Apple` with `1 medium sized apple`, the dinner line shows `19:30` before `"restaurant ramen"`, and their nutrients, the meal totals and the day total are the same as for the untimed lines

#### Scenario: Timed and untimed entries in a meal
- **WHEN** a day has `[breakfast]` with `09:00 coffee@1 1 cup`, `oats@2 60 g` and `07:30 milk@1 200 ml`, in that order
- **THEN** the breakfast group shows the three entries in that order, the first with `09:00`, the second with no time and no placeholder, and the third with `07:30`, and the breakfast total is the sum of all three

#### Scenario: Day without times
- **WHEN** a day file has no timed entries
- **THEN** the text day report is the same as without entry times

#### Scenario: Nothing logged
- **WHEN** `nomnom report 2026-09-20` runs and `logs/2026/2026-09-20.nom` does not exist
- **THEN** the output says that nothing was logged on 2026-09-20, and the exit status is 0

### Requirement: Range report
A text range report SHALL show:
- a header that names every catalog nutrient in catalog order, with its unit
- one row per date in the range, in date order, with that day's totals, or a marker that nothing was logged
- a total row with the range total and the number of logged days
- an average row with the average per logged day and the number of days it covers out of the days in the range, saying so when today was left out

Values SHALL be rounded to one decimal place. With `--entries`, the report SHALL first show the day report of each logged day in the range, in date order, with entry times as in a day report.

#### Scenario: Range with days not logged
- **WHEN** `nomnom report 2026-09-23 2026-09-26` runs and only 2026-09-23 and 2026-09-25 have entries
- **THEN** the output has four date rows, the rows for 2026-09-24 and 2026-09-26 show that nothing was logged, and the total row says 2 logged days

#### Scenario: Range with entries
- **WHEN** `nomnom report 2026-09-23 2026-09-26 --entries` runs and only 2026-09-23 and 2026-09-25 have entries
- **THEN** the output shows the day reports of 2026-09-23 and 2026-09-25, followed by the range rows, the total and the average

#### Scenario: Range with timed entries
- **WHEN** `nomnom report 2026-09-23 2026-09-26 --entries` runs, 2026-09-23 has `08:15 apple@2 1 medium sized apple` and `oats@2 60 g` under `[breakfast]`, where `apple@2` is named `Apple`, and only 2026-09-23 and 2026-09-25 have entries
- **THEN** the day report of 2026-09-23 shows `08:15` before `Apple` and the `oats@2` line with no time, in file order, and the range rows, the total and the average are the same as for the untimed lines

### Requirement: JSON output
With `--json`, the command SHALL print one JSON document to standard output, with the same shape for day and range reports:
- `from` and `to`: the reported dates, equal for a day report
- `nutrients`: every catalog nutrient in catalog order, as `id`, `name` and `unit`
- `days`: one object per date in the range, in date order, with `date`, `file` (the day file path, as in problem locations), `logged`, `meals` and `totals`
- each meal: `meal`, `configured` (whether it is in the configuration), `totals`, and `entries` in a day report or with `--entries`, in file order
- each entry: `line` (its line number in the day file), `kind` and `time` (the entry's time as an `HH:MM` string, or `null` when the entry has none); a reference entry also has `slug`, `version`, `item` (`food` or `recipe`), `name`, `amount` and `unit` (the default unit when the line gives none); an inline entry has `description`; every entry has `nutrients`
- `loggedDays`: the number of logged days
- `totals`: the range total
- `averageDays`: the dates the average covers
- `average`: the average per logged day, or `null` when there is none
- `warnings`: every warning, as `file`, `line` and `message`

Every entry SHALL have the `time` field, whether or not it has a time. Every nutrient value set (`nutrients` of an entry and each `totals` and `average`) SHALL be an object keyed by nutrient id with a value for every catalog nutrient, zeros included, rounded to two decimal places. Times SHALL NOT change any value set. A date with nothing logged SHALL have `logged: false`, no meals and zero totals.

#### Scenario: Day report as JSON
- **WHEN** `nomnom report 2026-09-29 --json` runs and that day has `"restaurant ramen" kcal=800 protein=35` on line 2 under `[dinner]`
- **THEN** standard output is one JSON document with `from` and `to` equal to `2026-09-29`, and one day whose `dinner` meal has an inline entry with `line` 2, `time` `null`, `description` `restaurant ramen` and `nutrients` `kcal` 800, `protein` 35 and 0 for every other catalog nutrient

#### Scenario: Timed entries as JSON
- **WHEN** `nomnom report 2026-09-29 --json` runs and that day has `[breakfast]` on line 1, `09:00 coffee@1 1 cup` on line 2 and `oats@2 60 g` on line 3
- **THEN** the `breakfast` meal has two entries in file order: the first with `line` 2, `time` `"09:00"`, `slug` `coffee`, `version` 1, `amount` 1 and `unit` `cup`, and the second with `line` 3 and `time` `null`, and the meal and day totals are the same as for the untimed lines

#### Scenario: Range as JSON with entries
- **WHEN** `nomnom report 2026-09-23 2026-09-29 --json --entries` runs and 2026-09-23 has `12:30 "restaurant ramen" kcal=800` under `[lunch]`
- **THEN** the `lunch` meal of 2026-09-23 has `entries` with an inline entry whose `time` is `"12:30"`, and every other entry in the document has a `time` field

#### Scenario: Range as JSON without entries
- **WHEN** `nomnom report 2026-09-23 2026-09-29 --json` runs
- **THEN** `days` has seven objects, each meal has `totals` but no `entries`, and `loggedDays`, `totals`, `averageDays` and `average` describe the range

#### Scenario: Nothing logged as JSON
- **WHEN** `nomnom report 2026-09-20 --json` runs and nothing is logged that day
- **THEN** the day has `logged: false`, an empty `meals` list and zero totals, `average` is `null`, and the exit status is 0
