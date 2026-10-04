# Proposal

## Why

A day file records what was eaten and in which meal, but not when. Meals are a coarse grouping, and the time of an entry matters, for example to see how intake is spread over a day or to tell apart two snacks hours apart. Users can only write the time into a comment today, which reports and agents can't read. Entries need an optional, machine-readable time that keeps the plain-text format simple and leaves every existing file valid.

## What Changes

- **Time prefix on entry lines**: a reference or inline entry line in a `.nom` file MAY start with a time `HH:MM` followed by whitespace, e.g. `08:15 apple@2 1 medium sized apple` or `12:30 "restaurant ramen" kcal=800`. The format is strict: two-digit hours `00`-`23`, two-digit minutes `00`-`59`. A malformed time-like prefix (such as `8:15` or `24:00`) is a validation error with the line number, not part of a slug.
- **Meaning of the time**: local wall-clock time on the day file's date. No time zone is stored. Times that are ambiguous or skipped by a DST change are accepted as written.
- **Untimed entries stay valid**: the time is optional. Untimed lines are read and kept exactly as before, and a line is never given a time it doesn't have.
- **No automatic timestamps**: `nomnom log` never adds the current time, including for today or a backdated `--date`. An entry has a time only when the user gives one.
- **`nomnom log --time HH:MM`**: sets the time of the entry for the positional and `--inline` forms, and of every entry of an `--entry` batch.
- **Per-entry time in `--entry`**: an `--entry` value MAY start with the same `HH:MM` prefix, so a batch can mix times and untimed entries.
- **Conflicting times are an error**: giving `--time` together with an `--entry` value that has its own time prefix fails. Every conflicting entry is reported with its position and text, alongside any other invalid entries, and nothing is written (the call stays all-or-nothing).
- **Standard form**: a timed entry is written as `HH:MM <entry>` in its usual standard form; an untimed entry is written as today.
- **Order unchanged**: entries keep their file order within a meal. Nothing is sorted by time, and the meal sections, their order and insertion rules are unchanged; a time does not need to match its meal.
- **Report**: the text day report shows an entry's time when it has one. In JSON, every entry gets a `time` field: the `HH:MM` string, or `null` when the entry is untimed.
- **Check and dry run**: `nomnom check` validates time prefixes by the same rules, and `nomnom log --dry-run` prints and previews timed lines exactly as a real run writes them.
- **No migration**: existing day files need no changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `daily-log`: optional `HH:MM` prefix on reference and inline entry lines; its meaning as local wall time on the file's date; `--time` for `nomnom log`; per-entry time prefixes in `--entry` values and the error for conflicts with `--time`; standard form of timed entries; no automatic timestamps.
- `report`: entry time in the text day report and a `time` field (string or `null`) on every JSON entry; entry order still follows the file.

## Impact

- **Core**: the day-file parser and validator (time prefix on entry lines), the entry model (optional time), the line formatter used by `log`, the log service (`--time`, per-entry times, conflict diagnostics in the existing all-or-nothing validation), and the report builder and its JSON shape.
- **CLI**: a `--time` option and help text for `nomnom log`; time display in the text day report. `check` and `--dry-run` reuse core and need no separate logic.
- **Compatibility**: every existing day file stays valid and reports the same totals. JSON consumers see one new field per entry, `time`, which is `null` for all existing entries.
- **Tests**: parser, formatter, log and report unit tests, plus end-to-end cases for `--time`, per-entry times, conflicts and JSON output.
