## Context

Day files hold entries only (see `proposal.md` and the `daily-log` spec). Everything a report needs already exists in `@nomnom/core`:

- `daylog/parse.ts` and `daylog/validate.ts` turn a day file into lines, errors, warnings and a map of meal to entry lines. The map is in the order meals first appear in the file.
- `catalog/` resolves `slug@version` to a food or recipe version, cached per run.
- `nutrition/` calculates `amountOf(item, amount, unit)` for foods and recipes. It resolves nested recipes recursively, caches recipe totals per `slug@version` for the run, and detects cycles.
- `DayLogService.log` already reads, parses and validates one day file before writing to it.

Two findings shape the design:

- `validateDay` checks that a reference entry's item and unit exist, but it doesn't look inside recipes. A day can pass validation and still fail to calculate, for example because of a recipe cycle or an ingredient pinned to a missing version. That error only appears inside `amountOf`, and it has no day file line.
- The CLI runner matches the longest command name, and `log` takes a meal as its first word. A `log show` command would make a meal named `show` impossible to log to, so the command is a separate `report`.

## Goals / Non-Goals

**Goals:**
- One core service that turns a date or range into fully calculated report data, with full precision and no formatting.
- CLI formatting of that data as text and as JSON, with rounding only at that point.
- One place that reads, parses and validates a day file, shared by `log` and `report`.

**Non-Goals:**
- Changing the day file format, its validation rules, or what `log` accepts or rejects.
- Checking nested recipes when `log` validates a day. `log` keeps its current checks, and only reports find calculation errors.
- Caching totals across runs, or any stored or derived files.
- Grouping by week or month, nutrient filters, relative dates and structured JSON errors. These are later changes.

## Decisions

### Core returns data, the CLI formats it

`ReportService.report(input)` takes the command-line values as text (`from?`, `to?`, `entries`). It returns a `Report`:

```
Report
  kind: "day" | "range"
  from, to, today            yyyy-mm-dd (today from the Clock)
  nutrients: Nutrient[]      the catalog, in order
  days: ReportDay[]          one per date, in date order
    date, path, logged
    meals: ReportMeal[]      configured order, then unknown ones in file order; empty meals omitted
      meal, configured, totals: Nutrients
      entries?: ReportEntry[]   (day report, or entries requested)
        line, nutrients: Nutrients, and either
          { kind: "reference", slug, version, item: "food"|"recipe", name, amount, unit }
          { kind: "inline", description }
    totals: Nutrients
  loggedDays: number
  totals: Nutrients
  averageDays: string[]      dates the average covers
  average: Nutrients | undefined
  warnings: Problem[]
```

Values stay unrounded `Nutrients` maps with every catalog nutrient. The CLI rounds them: one decimal place in text and two in JSON. This follows the existing rule of full precision internally and rounding only when printed. Core stays free of presentation, as the architecture rule requires.

Alternative considered: core builds the JSON document itself. Rejected, because the JSON document is an output format like the text table, and the CLI owns formatting.

### A shared day reader

A module function in `daylog/` reads a date's file through the `FileSystem` port, parses it and validates it. It returns the path, the lines and the `DayCheck`, where a missing file counts as empty. `DayLogService.log` switches to it without changing its behavior, and the report service uses it for every date. It is a plain function over `{ fs, paths, catalog }` and the loaded config, not a new service, because it has no state or choices of its own.

### Calculating a day

For each date:
1. Read the day and collect its validation errors and warnings.
2. When the day has no validation errors, calculate each entry:
   - A reference entry uses `catalog.resolve`, then `nutrition.amountOf` with the line's unit or the item's default unit.
   - An inline entry maps the catalog ids to its values, with absent ids counting as 0. Validation has already rejected keys that are not in the catalog.
3. Wrap each entry's calculation. A `NomnomError` becomes a problem at the day file and the entry's line, with the error's message, followed by any problems it carries. The nutrition module already prefixes ingredient errors with `In recipe <slug@v>:`, and cycle errors name the chain.
4. Sum entries into meal totals and meal totals into the day total. Order meals by `config.meals`, then unknown meals in first-seen order, and drop meals without entries.

Days are processed one after another, so the recipe cache fills once and the results come out in order. After every date is processed, the service throws a single `NomnomError` carrying every problem when any were collected. It never returns partial data, which is the strict rule in the spec. The message says which days have errors, for example `2 day files have errors; fix them to report on this range`.

Alternative considered: stop at the first invalid day. Rejected, because listing everything at once lets the user fix every file in one pass, and `log` already reports every error in a file.

### Dates, logged days and the average

- `from` defaults to today, from the injected `Clock` via `localDate`, and `to` defaults to `from`. Both are checked with `isIsoDate`, and `to < from` is an error. `kind` is `range` whenever two dates were given.
- A small helper in `shared/time.ts` lists the dates from `from` to `to` using UTC calendar arithmetic, without the current time.
- Every date is read with `readText`, which returns `undefined` for a missing file. No new `FileSystem` operation is needed.
- A logged day has at least one entry. `averageDays` lists the logged days except today, and `average` is their summed totals divided by their count, or `undefined` when no days remain. The range total includes every logged day, today included.

Alternative considered: listing `logs/<yyyy>/` to find existing files instead of reading every date. It would be faster for long, sparse ranges, but it adds code for no benefit at a personal scale. A missing file costs one failed read.

### Text layout

A fixed-width table with one right-aligned column per catalog nutrient. Columns are headed by the nutrient id, with a unit row under it. Ids are short and are what users type, while names such as `Carbohydrates` would widen every column. The label column fits the longest label.

```
2026-09-29                            kcal  protein    fat  carbs  fiber
                                      kcal        g      g      g      g
breakfast
  Apple  1 medium sized apple         95.0      0.5    0.3   25.1    4.4
  total                               95.0      0.5    0.3   25.1    4.4

dinner
  "restaurant ramen"                 800.0     35.0    0.0    0.0    0.0
  total                              800.0     35.0    0.0    0.0    0.0

day total                            895.0     35.5    0.3   25.1    4.4
```

```
                     kcal  protein    fat  carbs  fiber
                     kcal        g      g      g      g
2026-09-23         1850.2     92.1   60.3  210.0   25.1
2026-09-24              -        -      -      -      -
...
total              8200.0    ...                          5 logged days
average            1890.0    ...                          4 of 7 days, today left out
```

A day with nothing logged prints `2026-09-20: nothing logged`. With `--entries`, a range prints each logged day's table, then the range table. Formatting lives in pure functions in `apps/cli/src/commands/` and is tested directly.

### JSON output

The CLI maps `Report` to the document described in the spec. It turns `Nutrients` maps into objects keyed by id in catalog order and rounds with `Math.round(v * 100) / 100`, normalising `-0`. It prints the document with `JSON.stringify` on a single line. `kind` is not in the document, because the shape doesn't depend on it. Entries are included whenever core returned them.

### Warnings

The report command prints warnings to stderr in the same `warning: <file>:<line>: <message>` form as `log`. The existing formatting in the log command moves to a small shared helper. With `--json`, warnings go to stderr and also into the document, so a person watching the terminal and an agent reading stdout both see them.

### Wiring

`createServices` builds `createReportService({ fs, clock, paths, config, catalog, nutrition })`, reusing the existing `nutrition` instance, and adds `report` to `Services`. The interface and its types are exported from `src/index.ts`. The CLI gets a report service mock in `apps/cli/src/__mocks__/services.ts`.

## Risks / Trade-offs

- [A catalog change, such as removing a nutrient or making one required, invalidates old days with inline entries, and strict reports over them fail] → This was accepted in exploration. The error names each file and line, and fixing the files restores the reports. It can be revisited as a daily-log change.
- [Rounded parts don't always add up to the rounded total] → Totals are summed at full precision and rounded once. This is standard, and the JSON keeps two decimals for anyone who needs to check.
- [A very long range reads one file per date and prints one row per date] → That's fine at personal scale, since a year is 365 small reads. Grouping by week or month is the planned answer for long ranges.
- [Many catalog nutrients make the text table wide] → Ids keep the columns narrow. A nutrient filter is a later change, and JSON has no width limit.
- [Agents come to depend on the JSON shape] → Later changes should only add fields. The spec defines the fields, so changing them means a spec change.
- [`log` still accepts writing to a day that can't be calculated] → The report surfaces the problem with its line. Checking nested recipes during validation can be a later daily-log change.
