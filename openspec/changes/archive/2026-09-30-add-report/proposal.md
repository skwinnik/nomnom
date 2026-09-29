## Why

nomnom can record what was eaten but has no way to show it. Day files store entries only, and every total must be calculated from them, yet no command does that calculation. The old kcalops tool had `log show <date> [<to>]` with per-meal and per-day totals, and hledger reports over any date range. nomnom needs the same view for people reading in a terminal and for agents reading JSON, before any further features such as trends can build on it.

## What Changes

- Add `nomnom report [<from> [<to>]]`:
  - With no date, it reports today. With one date, it shows that day's entries grouped by meal, with each meal's total and the day total.
  - With two dates, it reports the inclusive range: one row per date, the range total, and the average per logged day. `--entries` adds each day's entries.
  - `--json` prints the same data as one JSON document whose shape is the same for a day and a range.
- Totals are calculated from the entries with the existing nutrition calculation. Reference entries resolve their pinned food or recipe version, with nested recipes calculated recursively. Inline entries contribute their typed-in values, with absent nutrients counting as 0.
- The average divides by logged days: dates with at least one entry. When today is in the range, it is left out of the average because it is still partial, but it stays in the total. The output says how many days the average covers and whether today was left out.
- Reports are strict. When any day in the range is invalid, or an entry can't be calculated (for example, a recipe cycle found only while calculating), the report prints nothing on standard output. It lists every problem from every day with its file and line, and exits with status 1.
- Sections for meals that are not configured are counted in the totals, shown after the configured meals, and reported as warnings.
- Out of scope, planned as later changes: grouping by week or month and trends, filtering nutrients, relative dates such as `yesterday`, structured JSON errors, and an option to include today in the average. Inline entry rules stay as they are, so removing a nutrient from the catalog or making one required can still invalidate old days, and reports over those days fail until the files are fixed.

## Capabilities

### New Capabilities

- `report`: the `nomnom report` command, covering the day view and range view, total and average calculation, text and JSON output, and how invalid days, calculation errors and unknown meals affect a report.

### Modified Capabilities

None. The day file format, its validation rules and `nomnom log` are unchanged.

## Impact

- `@nomnom/core` gets a new report service, added to `createServices` and exported from `src/index.ts`. It reuses the catalog, the nutrition calculation and the day file parser and validator. The day file reading that `log` does (read, parse, validate) moves into a helper both services share.
- `@nomnom/cli` gets a new `report` command, with text and JSON formatting.
- No new dependencies, no new file-system port operations, and no changes to data files.
