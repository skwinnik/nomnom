# Design

## Context

A day file line is parsed by `parseLine` in `packages/core/src/daylog/parse.ts` into a `LineContent` (`blank`, `comment`, `section`, `reference`, `inline` or `error`). `parseDay` keeps each line's `raw` text next to its content, `validateDay` (`daylog/validate.ts`) turns `error` lines into problems with the file and line number and checks entries with `checkEntry`, and `readDay` combines both. `log`, `check` and `report` all read days through `readDay`.

`nomnom log` (`daylog/daylog-service.ts`) builds new lines in the standard form (`pinReference`, `formatInline`), re-parses each with `parseLine` and checks it with `checkEntry`, so a new line passes exactly the rules of a hand-written one. `--entry` values go through `parseEntryText`, which shares `parseInline` and `parseAmount` with the day-file parser but allows a missing version and rejects comments. `entryLines` collects the problems of every invalid `--entry` value, labelled `entry <n> '<text>'`, before anything is written. `insertEntries` (`daylog/insert.ts`) splices the new raw lines into the existing raw lines, and the CLI runner's staged file system commits the write on success or previews it on `--dry-run`.

The report (`report/report-service.ts`) turns each entry line into a `ReportEntry`; the CLI renders it as text (`apps/cli/src/commands/report-text.ts`) or JSON (`report-json.ts`).

Slugs only contain letters, digits and `-` (`shared/slug.ts`), so no valid line today has a first word with `:` in it. That is what lets a time prefix be recognised without ambiguity.

## Goals / Non-Goals

**Goals:**

- An optional, strictly formatted `HH:MM` prefix on reference and inline entry lines, kept as written and exposed in the parsed model and the report.
- One recognition rule for the prefix, shared by day files and `--entry` values, that never changes how an untimed line, including a slug starting with digits, is read.
- `nomnom log --time`, per-entry times in `--entry`, and conflicts between the two reported with the other invalid entries in the existing all-or-nothing validation.
- Every existing day file keeps parsing, validating and reporting exactly as before.

**Non-Goals:**

- Time zones, UTC offsets, seconds, 12-hour times or any other time format.
- Sorting, grouping or checking entries by time, or checking a time against its meal, the current time or other entries.
- Automatic timestamps, or any use of the clock for times.
- Editing or adding times to existing lines.
- Time-based report features such as intake per hour.

## Decisions

### 1. The time is the `HH:MM` text, an optional field on entry content

`LineContent`'s `reference` and `inline` variants get `readonly time?: string`, absent when the line has no prefix, like the existing optional `unit`. `parseEntryText`'s results get the same field. The value is the five characters as written, not a number of minutes or a `Date`: the spec forbids any conversion, the text is what is written back and shown, and `HH:MM` strings already compare in time order should a later feature need it.

`ReportEntry` gets `time: string | undefined` as a required key, mirroring `Report.average: Nutrients | undefined`. The required key makes the compiler insist that every place building a `ReportEntry` decides on the time, so it can't be dropped by accident. Core keeps `undefined` for "none"; turning it into JSON `null` is the CLI's job, as it already is for `average`.

*Alternatives:* `time: string | null` in core would put a JSON concern into the domain model and clash with how optional values are modelled elsewhere. A separate `{ hours, minutes }` value adds a conversion with nothing to gain, since nothing calculates with times.

### 2. Validity in `shared/time.ts`

`shared/time.ts` gets `isTimeOfDay(text): boolean`, true exactly for `/^([01]\d|2[0-3]):[0-5]\d$/`. It sits next to `isIsoDate` and is the only definition of a valid time, used by the parser and by `--time`. It isn't exported from `@nomnom/core`: the CLI doesn't parse times.

### 3. Recognising the prefix: the first word decides

One internal function in `parse.ts`, `splitTime(line)`, takes a trimmed line and returns `{ time?: string; rest: string }` or throws `NomnomError`:

1. Take the first word, the text up to the first whitespace character.
2. If it doesn't match `/^\d+:/` (digits then a colon), the line is **not time-like**: return `{ rest: line }` unchanged. `7up@1 1 can`, `123-cereal@2 40 g`, `"lunch at 12:30" kcal=500`, `#…` and `[…]` take this path, so untimed lines are read byte for byte as today.
3. Otherwise the line is time-like and must have a valid prefix. The checks run in this order, each with its own message:
   - The word is a valid time with text stuck to it (its first five characters pass `isTimeOfDay` and the sixth is neither a digit nor `:`, as in `08:15apple@2` or `12:30"ramen"`): `the time '08:15' must be followed by a space and an entry`.
   - Any other word that isn't a valid time (`8:15`, `24:00`, `12:60`, `08:15:30`, `8:15pm`, `08:5`): `'8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59`.
   - The rest after the whitespace is empty or starts with `#`: `the time '08:15' needs an entry after it`.
   - The rest starts with `[`: `the time '08:15' needs an entry after it, not a section header`.
   - The rest's first word is itself time-like: `a line has at most one time, got '09:00' after '08:15'`.
4. Otherwise return `{ time: word, rest }`, with `rest` trimmed at the start.

Making "digits then a colon" the trigger is what the spec calls time-like. It is strict enough that no slug can trigger it (slugs never contain `:`), and broad enough that every near-miss (`8:15`, `24:00`, `08:15:30`, `08:15apple`) becomes a precise error rather than an unhelpful "is not a valid food or recipe name" about a slug.

The time-without-entry checks look at the rest *before* comments are removed, so `08:15  # coffee` is reported as a time without an entry, not as an empty reference. A malformed time is reported even when a comment or section header follows, since the first word alone decides.

*Alternatives:* a regex matching only valid prefixes and treating anything else as a reference would read `8:15 apple@2 1` as a slug `8:15` and report a misleading name error, which the spec forbids. Treating any digit-leading word as a time candidate would break `7up@1`.

### 4. One parser for day lines and `--entry` values

`parseLine` keeps its order: `\r` stripped and trimmed, then blank, then `#` comment. Before dispatching on the first character, it calls `splitTime`, and dispatches on `rest` instead of the whole line: `"` goes to `parseInline(rest)`, anything else to `parseReference(stripComment(rest))`. A `[` can't follow a valid prefix (step 3 rejects it), so section headers keep being matched only on lines without a time. The resulting entry content is returned with `time` added when present. `splitTime` throws `NomnomError`, so the existing `try` turns its errors into `error` lines, and `validateDay` reports them with the file and line number as it reports every other parse error. `parseDay` and `DayLine.raw` don't change.

`parseEntryText` keeps its first check (an empty value, `#…` or `[…]` is not an entry), then calls the same `splitTime`, then runs its existing comment rejection and inline/reference parsing on `rest`. So `--entry` values follow the same time rules and messages as day lines, `08:15` alone is rejected as a time without an entry, `08:15 # x` as a time without an entry (the time check runs before the comment check), and `08:15 apple 1 # x` as containing a comment. The version stays optional and comments stay rejected, as today.

### 5. `nomnom log --time`

`LogInput` gets `time?: string`, as typed. In `log`, right after the meal and date checks and before any entry is built:

- A given `time` that fails `isTimeOfDay` throws `The time must be HH:MM, from 00:00 to 23:59, got '8:15'`. Like an invalid `--date`, this is a problem with the call, not with an entry, so it fails at once instead of being repeated under every `--entry` value.
- A positional `ref` that is time-like (`/^\d+:/`, the same test as `splitTime`) throws `Give the time with --time, as in 'nomnom log breakfast apple 1 --time 08:15'`, whether or not the word is a valid time. It runs before the form checks so the message is the same with every combination of options.

Each line is built as before in the standard form, then prefixed with `withTime(time, line)`, which returns `` `${time} ${line}` `` or the line itself when `time` is undefined. That is the only place a time is written, so every timed line has exactly one space after the time.

- **Positional and `--inline` forms:** `singleLine` prefixes the built line with `input.time`. An `--inline` description is always written in quotes by `formatInline`, so `--inline '12:30 ramen'` stays text inside the description and is never read as a time.
- **`--entry` values:** `entryLine` gets the call's `--time`. After `parseEntryText`, a value with its own time when `--time` is given is a conflict, even when the times are equal, and gets the problem `it has its own time 07:30, which conflicts with --time 08:00`. The value's remaining checks still run and their problems follow the conflict, so one run shows everything wrong with it. The line's time is the value's own time, or `--time` when it has none, or none.
- **Validation:** the full prefixed line goes through `parseLine` and `checkEntry`, as today. This checks the time prefix and the entry with the parser of hand-written lines, so a line `log` writes is always one `check` accepts.
- **Errors:** a conflicting value counts as invalid in `entryLines`, so it is reported with the existing `entry <n> '<text>'` label (whose text includes the value's own prefix) together with every other invalid value, the `Can't log <n> of <m> entries` message counts it, and nothing is written. A malformed per-entry time (`'8:15 milk 200 ml'`) is a parse problem of that value and is reported the same way. A malformed `--time` fails the whole call before any entry is looked at, as described above.

### 6. No clock, no conversion

The time comes only from `--time` or a prefix. The date stays `input.date ?? localDate(clock.now())`, the only use of the clock, and the time is never read from it, compared with it or used to choose the date. Date and time are independent: `--date 2026-03-29 --time 02:30` writes `02:30` into that day's file even if 02:30 doesn't exist there because of a DST change, and a time later than now on today's date is accepted. Times are never converted to an instant, so the parser and the report don't need a time zone.

### 7. Writing and dry run don't change

`insertEntries` keeps working on raw lines: existing lines, timed or not, are kept byte for byte, and the insertion point is still after the last entry or comment of the meal's last section. Timed entries are `reference` or `inline` content, so they count as entries there with no change. Nothing is sorted. Because `log` writes through the staged file system, `--dry-run` previews exactly the lines a real run writes, times included, and a conflict or an invalid time fails a dry run before anything is staged.

### 8. Report and check

`calculate` in the report service copies `content.time` into the `ReportEntry`. Values, totals, averages and entry order don't depend on it.

- **Text:** `entryLabel` puts the time and one space before the name or quoted description when there is one: `08:15 Apple  1 medium sized apple`, `19:30 "restaurant ramen"`. An untimed label is unchanged, with no padding or placeholder, so a day without times renders exactly as before. The label column already widens to the longest label. Range reports with `--entries` reuse `formatDay` and need nothing more.
- **JSON:** `entryJson` adds `time: entry.time ?? null` right after `kind` for both entry kinds, so every entry has the field.
- **Check:** `nomnom check` reads days through `readDay`, so malformed prefixes become errors with line numbers with no change to the command.

### 9. CLI

`apps/cli/src/commands/log.ts` declares `time: { type: "string", valueName: "HH:MM", description: "The time of the entries, such as 08:15; with --entry, for values without their own time (default: none)" }` and passes it on as `time` when given. The help comes from that definition. The `--entry` description mentions the optional `HH:MM` prefix. The command does no validation of its own.

### 10. Reserve the CLI option name in configuration

`--time` is a built-in CLI option, so add `"time"` to `BUILT_IN_OPTION_NAMES` in `packages/core/src/shared/options.ts`. Add a regression test in `packages/core/src/config/parse-config.test.ts` verifying that a nutrient id `time` is rejected as reserved. Otherwise a user-defined `--time` nutrient option would collide with the log command's time-of-day option. This is part of the log/CLI implementation block. Existing configurations that use `time` as a nutrient id will be rejected after this change; the current local nutrition config does not use it. Do not edit or migrate any user data in this change.

### 11. Tests

- `shared/time`: `isTimeOfDay` at the boundaries (`00:00`, `23:59`, `09:05` valid; `24:00`, `12:60`, `8:15`, `08:5`, `0815`, `08:15:30`, ` 08:15`, `８:15` with a full-width digit invalid).
- `parse`: every spec scenario of "Line types", "Reference entries" and "Inline entries", plus tab and multiple-space separators, a CRLF line, `18:00 7up@1 1 can`, `123-cereal@2 40 g` untimed, `"lunch at 12:30"` untimed, a timed inline line with a trailing comment, and `raw` kept exactly. `parseEntryText` with prefixes, `08:15`, `08:15 # x`, `08:15 apple 1 # x` and `'  08:15    apple   1 … '`.
- `validate` / `check`: one error per malformed line with its line number, and an existing untimed fixture giving the same result as before.
- `insert`: timed lines inserted after the last (timed or untimed) entry with no line moved.
- Log service: `--time` with each form, a mixed batch, conflicts (equal and different times) reported with other invalid entries and nothing written, malformed `--time`, a time-like positional word, `--inline '12:30 ramen'`, and a fake clock at 08:15 producing an untimed line.
- Report service and CLI formatters: `time` on `ReportEntry`, text labels with and without times, unchanged output for an untimed day, and `time` `null` / `"HH:MM"` in JSON.
- End to end: `--time`, per-entry times, conflicts, `--dry-run` with times, `check` on a malformed time, the JSON report, and `--time` listed in `nomnom log --help`.

## Risks / Trade-offs

- [A line that used to fail as a bad reference now fails with a time message] -> No valid file changes meaning: a first word containing `:` was never a valid slug, so such lines were already errors. Only the wording of their error improves.
- [A future slug format containing `:` would collide with time recognition] -> Slugs are restricted to letters, digits and `-` by `isSlug`. The parser tests pin `7up@1` and digit-leading slugs, so a change there would show.
- [A required `ReportEntry.time` key breaks any code building `ReportEntry` values, such as test fixtures and mocks] -> Intended: the compiler points at every place to update, and `bun run typecheck` runs before each commit.
- [JSON consumers that reject unknown fields see a new `time` field] -> It is additive and always present (`null` when untimed), so consumers can rely on the shape. The proposal records the change.
- [Times are not tied to an instant, so they can't be compared across DST changes or time-zone moves] -> This is the specified meaning (local wall-clock time on the file's date). Nothing in this change calculates with times.
- [Text report labels of timed and untimed entries don't line up] -> Required by the spec (no placeholder), and it keeps untimed reports byte-identical. Values stay aligned in their own columns.
- [Reporting a conflict and the value's other problems together can show several lines for one entry] -> All lines carry the same `entry <n> '<text>'` label, and the conflict comes first.

## Migration Plan

Existing day files are read unchanged, `log` without `--time` writes the same lines as before, and existing JSON entries gain `time: null`. Configurations using the previously allowed nutrient id `time` must rename that nutrient id before using the new CLI; the active local nutrition config does not use it. No user data or configuration is migrated by this change. Rolling back is safe as long as no timed lines were written. Timed lines written by this version are errors for older versions, which name the line, and removing the prefix fixes them.
