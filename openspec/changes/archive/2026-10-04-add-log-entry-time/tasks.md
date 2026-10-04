# Tasks

## 1. Day-file time grammar, model and validation

- [x] 1.1 Start from the baseline project code on `main`, with no other group of this change applied. The tree is not clean: the only change present is this untracked planning change, `openspec/changes/add-log-entry-time/`. Confirm it with `git status --porcelain=v1 --untracked-files=all`, which lists only paths under that directory. Work happens in the shared working tree and nothing is committed. Keep this group to `packages/core/src/shared/time.ts`, `packages/core/src/daylog/parse.ts`, their tests, the daylog `validate` and `insert` tests, and the check service and `check` end-to-end tests. Do not touch `daylog-service.ts`, `apps/cli/src/commands/log.ts`, the report code or `README.md`. Verify: `bun test`, `bun run typecheck` and `bun run check` pass before any edit.
- [x] 1.2 Test first: in `packages/core/src/shared/time.test.ts`, add failing tests for `isTimeOfDay`. Valid: `00:00`, `09:05`, `23:59`. Invalid: `24:00`, `12:60`, `8:15`, `08:5`, `0815`, `08:15:30`, `8:15pm`, ` 08:15`, `８:15` (a full-width digit) and the empty string. Verify: `bun test packages/core/src/shared/time.test.ts` fails only because `isTimeOfDay` does not exist yet.
- [x] 1.3 Implement `isTimeOfDay(text)` in `shared/time.ts` next to `isIsoDate`, as exactly `/^([01]\d|2[0-3]):[0-5]\d$/`, with a doc comment saying it is the only definition of a valid time. Do not export it from `@nomnom/core`. Verify: the 1.2 tests pass, and `packages/core/src/index.ts` is unchanged.
- [x] 1.4 Test first: in `daylog/parse.test.ts`, add failing `parseLine`/`parseDay` tests for valid timed lines:
  - the spec examples: `08:15 apple@2 1 medium sized apple`, `18:00 7up@1 1 can`, `12:30 "restaurant ramen" kcal=800 protein=35`, and the "Example day with times" file, including `19:30 "restaurant ramen" ... # with friends` with a trailing comment
  - separators: a tab, and several spaces after the time
  - a CRLF line
  - `23:30 "late cereal" kcal=300` under `[breakfast]` (the time doesn't match the meal)
  - `00:00` and `23:59`
  - DST wall times kept as written, with no conversion and no clock: a skipped `02:30`, and a repeated `02:15` then `02:45`
  - file order kept for `09:00 coffee@1 1 cup`, `07:30 oats@2 60 g`, `milk@1 200 ml`

  Verify: the new tests fail and every existing parse test still passes.
- [x] 1.5 Test first: add failing tests pinning legacy and untimed behaviour. These lines have no `time` key and the same content as before: `apple@2 1 medium sized apple`, `7up@1 1 can`, `123-cereal@2 40 g`, `"lunch at 12:30" kcal=500` (text inside a description is never a time), comments and section headers. `DayLine.raw` is byte for byte the line as read, for both timed and legacy lines, including odd spacing and a trailing `\r`. Verify: the tests that need the new field fail, and the pure legacy assertions pass before and after the change.
- [x] 1.6 Test first: add failing tests for time-like malformed lines, one per design message:
  - text stuck to a time: `08:15apple@2 1 medium sized apple`, `12:30"ramen" kcal=800`
  - not a valid time: `8:15`, `24:00`, `12:60`, `08:15:30`, `8:15pm`, `08:5`, each followed by an entry, and a malformed time followed by a comment or a section header
  - time without an entry: `08:15`, `08:15  # coffee`
  - time followed by a section header: `08:15 [lunch]`
  - two times: `08:15 09:00 apple@2 1`
  - missing version after a valid time: `08:15 apple 1 medium sized apple`

  Assert that each one becomes an `error` line with the expected message and is never read as a slug. Verify: the tests fail on the current parser.
- [x] 1.7 Implement it in `parse.ts`:
  - add `readonly time?: string` to the `reference` and `inline` variants of `LineContent`, with a doc comment: local wall-clock time on the file's date, kept as written, absent when untimed
  - add the internal `splitTime(line)`, where the first word decides: a word that is not `/^\d+:/` is returned unchanged, and the checks then run in the order the design gives
  - make `parseLine` dispatch on `rest` and add `time` only when one is present
  - leave `parseDay` and `DayLine` unchanged

  Verify: all the tests from 1.4 to 1.6 pass, and the existing parse tests pass unchanged.
- [x] 1.8 Test first, then implement `--entry` text parsing in `parseEntryText`. The tests cover:
  - a timed reference, with and without a version, and a timed inline value
  - `'  08:15    apple   1 medium sized apple '`, which gives the time `08:15` and the reference `apple`
  - `7up 1 can`, untimed
  - `08:15` and `08:15 # x`, rejected as a time without an entry
  - `08:15 apple 1 # x`, rejected as containing a comment
  - `8:15 milk 200 ml`, rejected as an invalid time
  - `[lunch]`, the empty string and `# x`, still rejected
  - `"ramen # spicy" kcal=800`, still accepted

  Then add `time?` to both result variants and call `splitTime` after the existing first check and before the comment check. Verify: `bun test packages/core/src/daylog` passes.
- [x] 1.9 Cover validation in `daylog/validate.test.ts`:
  - the spec fixtures "Malformed time" and "Time without an entry" each give exactly one error per line, with the file and the line number
  - a valid timed file (the example day with times, the DST lines, a time that doesn't match its meal) gives no problems
  - an existing untimed fixture gives exactly the same problems and warnings as before

  `validate.ts` should need no change. If it does, keep the change inside that file and explain it in the card handoff. Verify: `bun test packages/core/src/daylog` passes.
- [x] 1.10 Cover insertion in `daylog/insert.test.ts`, with no change to `insert.ts`. `[breakfast]` with `09:00 coffee@1 1 cup`, then a blank line and `[lunch]`: the new raw line `07:30 oats@2 60 g` goes directly after the timed entry, no line moves, and existing timed and untimed raw lines are kept byte for byte. Verify: `bun test packages/core/src/daylog/insert.test.ts` passes.
- [x] 1.11 Cover `check`, with no change to the check command or service code:
  - in the check service tests, a day file with the malformed and time-without-entry lines reports each line with its file and line number, and a valid timed day passes
  - in the `check` end-to-end tests (`withSandbox`, a hand-written fixture day file with made-up items in the temporary directory), `nomnom check` exits 1 and names `file:line` for `8:15 ...`, and exits 0 for valid timed lines

  Verify: both test files pass.
- [x] 1.12 Finish the group's docs and verify it:
  - doc comments on `isTimeOfDay`, `splitTime` (the first-word rule, and why slugs can never trigger it) and the `time` fields. The README is documented in group 2.
  - run `bun test`, `bun run typecheck` and `bun run check`; all pass
  - check the scope of the uncommitted changes: `git status --porcelain=v1 --untracked-files=all` lists only the files named in 1.1 and the planning files under `openspec/changes/add-log-entry-time/`, `git diff --stat` shows the tracked edits only in those files, and `git diff --check` reports nothing

  Note in the card handoff that until group 2 is done, `log` ignores a per-entry prefix, so groups 1 and 2 must be released together.

## 2. Log entry time and CLI

- [x] 2.1 Start after group 1 is completed in this same working tree: its tasks are checked off and its card handoff is done. Its changes are uncommitted and stay in place. Keep this group to `packages/core/src/daylog/daylog-service.ts` and its tests, `apps/cli/src/commands/log.ts` and its tests, the `log` end-to-end tests, `packages/core/src/shared/options.ts`, `packages/core/src/config/parse-config.test.ts`, and the "Commands" and "Day files" sections of `README.md`. The two added paths are for reserving `time` as a built-in option and testing the collision. Do not touch `parse.ts`, `insert.ts` or the report code. Verify: `bun test` passes on the starting point.
- [x] 2.2 Test first: in the daylog service tests, using the in-memory file system mock, a fake clock and made-up items (never real nutrition data), add failing tests for successful timed logs:
  - `--time 08:15` with the positional form writes and returns `08:15 apple@2 1 medium sized apple`
  - `--time 19:30` with `--inline` writes `19:30 "restaurant ramen" kcal=800 protein=35`
  - `--inline '12:30 ramen'` writes the untimed line `"12:30 ramen" kcal=800`
  - `--time 07:45` with two `--entry` values prefixes both lines
  - the mixed batch `07:30 oats 60 g`, `milk 200 ml`, `08:10 "hotel coffee" kcal=5` writes the three lines in order, the middle one untimed
  - `'  08:15    apple   1 medium sized apple '` is written in standard form
  - `7up 1 can` is written untimed

  Verify: the new tests fail and the existing log tests pass.
- [x] 2.3 Test first: add failing tests for rejected calls. In each, nothing is written and no file is created.
  - an invalid `--time` (`8:15`, `24:00`, `12:60`) fails at once with `The time must be HH:MM ...`, naming the value, before any entry is checked, so the message is not repeated per `--entry`
  - a time-like positional word (`08:15`, `8:15`) fails with the "Give the time with --time" message whatever other options are given
  - the "Conflicting times" scenario reports entries 1 and 3 (one of them with a time equal to `--time`) and entry 4 with its unit problem, does not report entry 2, and the message counts `Can't log 3 of 4 entries`
  - a conflicting value with another problem lists the conflict first, then its other problems, all under the same `entry <n> '<text>'` label
  - `8:15 milk 200 ml` and `08:15` given with `--entry` are reported as invalid entries

  Verify: the tests fail on the current service.
- [x] 2.4 Test first: add failing tests for the clock, dates and placement:
  - a fake clock at 08:15 today, a backdated `--date 2026-09-20` and a future date all write untimed lines
  - `--date 2026-03-29 --time 02:30`, a time skipped by DST, is written as given
  - a time later than the fake clock's "now" on today is accepted
  - with an existing `09:00 coffee@1 1 cup`, `--time 07:30` inserts `07:30 oats@2 60 g` directly after it, and no line moves
  - existing timed and untimed lines stay byte-identical
  - every written timed line is accepted by `readDay` (the rules of `check`)

  Verify: the timed tests fail and the untimed ones pass.
- [x] 2.5 Implement it in `daylog-service.ts`:
  - add `time?: string` to `LogInput`, checked with `isTimeOfDay` right after the meal and date checks
  - reject a time-like positional `ref` (`/^\d+:/`) before the form checks
  - add `withTime(time, line)` as the only place a time is written, used by `singleLine` and `entryLine`
  - in `entryLine`, report the conflict `it has its own time 07:30, which conflicts with --time 08:00` followed by the value's other problems, and count it as invalid in `entryLines`
  - pass each full prefixed line through `parseLine` and `checkEntry`
  - never read the clock for a time

  Verify: the tests from 2.2 to 2.4 and all existing daylog tests pass.
- [x] 2.6 Add the option to `apps/cli/src/commands/log.ts`: `time: { type: "string", valueName: "HH:MM", description: ... }` worded as in the design, a mention of the optional `HH:MM` prefix in the `--entry` description, and `time` passed through only when given, with no validation in the command. In the CLI unit test (mocked daylog service, captured `io`), check that `--time 08:15` reaches the service as `time` and that the key is absent without the option. Test first in `packages/core/src/config/parse-config.test.ts` that a nutrient id `time` is rejected as reserved; then add `"time"` to `BUILT_IN_OPTION_NAMES` in `packages/core/src/shared/options.ts` so the new option cannot collide with a nutrient flag. Document in the handoff that pre-existing configurations using a nutrient id `time` are incompatible; never edit user data here. Verify: `bun test apps/cli packages/core/src/config/parse-config.test.ts` passes.
- [x] 2.7 Add `log` end-to-end tests with `withSandbox`, creating made-up foods inside the sandbox with `food add`:
  - `--time` with the positional and `--inline` forms
  - the mixed `--entry` batch, and `--time` with a batch
  - the conflict batch: exit 1, entries 1, 3 and 4 on stderr, day file unchanged
  - a malformed `--time` and a positional time word
  - `--dry-run` cases: "Dry run of timed entries" into an existing section, "Timed dry run of the first entry of the day" (neither the file nor `logs/2026/` is created), and "Dry run with a conflicting time" (fails, prints no preview)
  - an untimed run for today and a backdated `--date` run, both writing lines without a prefix
  - `nomnom log --help` lists `--time` with `HH:MM`

  Verify: the end-to-end tests pass.
- [x] 2.8 Update `README.md`, only the "Commands" code block, the `log` sentence after it and the "Day files" section. Document:
  - `--time HH:MM` and `--entry` values with a prefix, a timed example, the rule that `--time` conflicts with a value's own time, and that `log` never adds the current time
  - the time prefix syntax: strict `HH:MM` from `00:00` to `23:59`, local wall-clock time on the file's date, no time zone, DST times kept as written, optional, never sorted, need not match the meal
  - time-like errors, and that slugs starting with digits are unaffected
  - a timed line in the example day file

  Verify: every README example matches the actual output of the 2.7 runs.
- [x] 2.9 Verify the group: `bun test`, `bun run typecheck` and `bun run check` pass. `git status --porcelain=v1 --untracked-files=all` lists only the files named in 1.1 and 2.1 and the planning files under `openspec/changes/add-log-entry-time/`, `git diff --stat` shows that this group's tracked edits are only in the files named in 2.1 (group 1's files are already changed), and `git diff --check` reports nothing.

## 3. Report time propagation and formatting

- [x] 3.1 Start after groups 1 and 2 are completed, in that order, in this same working tree: the coordinator runs the groups one after another, so both groups' uncommitted changes are already present. This group does not depend on group 2's code: its fixtures can still be hand-written timed day files. Keep this group to `packages/core/src/report/report-service.ts`, `apps/cli/src/commands/report-text.ts`, `apps/cli/src/commands/report-json.ts`, their tests, any test fixtures or `__mocks__` that build `ReportEntry`, the `report` end-to-end tests, and report sentences in `README.md`. Verify: `bun test` passes on the starting point.
- [x] 3.2 Test first: add failing tests in the report service tests. Hand-written timed and untimed lines with made-up items give:
  - `time` `"08:15"` for a timed reference and `"19:30"` for a timed inline entry
  - `time: undefined`, with the key present, for untimed entries
  - entries in file order for `09:00 coffee@1 1 cup`, `oats@2 60 g`, `07:30 milk@1 200 ml`
  - DST times as written
  - nutrients, meal totals, day totals, range totals and averages identical to the same lines without times
  - each day's entries keeping their times in a range with `--entries`

  Verify: the new tests fail.
- [x] 3.3 Implement it: add `time: string | undefined` as a required key on `ReportEntry`, set by `calculate` from `content.time`. Update every place `bun run typecheck` flags as building a `ReportEntry` (test fixtures, `apps/cli/src/__mocks__`). Verify: the 3.2 tests pass and `bun run typecheck` is clean.
- [x] 3.4 Test first, then implement the text report in `report-text.ts`. `entryLabel` puts the time and one space first, as in `08:15 Apple  1 medium sized apple` and `19:30 "restaurant ramen"`. The tests cover:
  - an untimed label with no placeholder or padding
  - a mixed meal in file order
  - the label column widening to the longest label
  - output for a day without times byte-identical to the existing expected output
  - range output with `--entries`, which goes through `formatDay`, showing the times

  Verify: `bun test apps/cli` passes.
- [x] 3.5 Test first, then implement JSON in `report-json.ts`: `entryJson` adds `time: entry.time ?? null` right after `kind` for both entry kinds. The tests cover:
  - `"09:00"` with `line` 2 and `null` with `line` 3 in the "Timed entries as JSON" scenario
  - every entry having the field in day reports and in ranges with `--entries`
  - no `entries` in a range without `--entries`
  - nutrient value sets unchanged

  Verify: `bun test apps/cli` passes.
- [x] 3.6 Add `report` end-to-end tests with `withSandbox`, using made-up items and hand-written day files:
  - the "Timed entries" and "Timed and untimed entries in a meal" text scenarios
  - "Day without times" text output unchanged
  - "Range with timed entries" with `--entries`
  - "Timed entries as JSON"
  - "Range as JSON with entries", where `12:30` is shown and every entry has `time`
  - "Day report as JSON", where `time` is `null`

  Verify: the end-to-end tests pass.
- [x] 3.7 In `README.md`, add a short paragraph after the "Commands" paragraph saying that the text report shows `HH:MM` before a timed entry's name or description, and that every JSON entry has `time` (`"HH:MM"` or `null`). Leave the `log` sentence and the "Day files" section to group 2. Verify: the wording matches the 3.6 output.
- [x] 3.8 Verify the group: `bun test`, `bun run typecheck` and `bun run check` pass. `git status --porcelain=v1 --untracked-files=all` lists only the files named in 1.1, 2.1 and 3.1 and the planning files under `openspec/changes/add-log-entry-time/`, `git diff --stat` shows that this group's tracked edits are only in the files named in 3.1 (the files of groups 1 and 2 are already changed, and `README.md` is shared with group 2), and `git diff --check` reports nothing.

## 4. Final cross-layer integration checks

- [x] 4.1 Start after groups 1, 2 and 3 are marked done on the card and checked off. Their changes are uncommitted in this same working tree; the tree is not clean and nothing is merged. This group adds no tests or docs: any gap goes back to the group that owns it. In that working tree, run `bun test`, `bun run typecheck` and `bun run check`. Verify: all three pass, and the output is recorded on the card.
- [x] 4.2 Run a CLI smoke test with `bun run nomnom` in a scratch data directory only, never the default data directory (`~/.nomnom`): first `export NOMNOM_DIR="$(mktemp -d "${TMPDIR:?}/nomnom-smoke.XXXXXX")"` and `trap 'rm -rf "$NOMNOM_DIR"' EXIT`, so the directory is under `$TMPDIR` and removed however the run ends. Use one or two placeholder foods with made-up values and no real nutrition data. Run:
  - `log --time` and a mixed `--entry` batch, and confirm the printed lines equal the lines in the file
  - a conflicting batch and an invalid `--time` (exit 1, file unchanged)
  - a timed `--dry-run` (preview equals the real run, nothing written)
  - `check` on the written file (exit 0) and on a hand-added `8:15 ...` line (exit 1 with `file:line`)
  - `report` as text and `--json` with the same times

  Verify: every result matches the spec scenarios, the scratch directory is gone after the trap runs, and the default data directory is untouched.
- [x] 4.3 Review coverage without writing anything. Map every scenario of both spec deltas and every design decision to a test from groups 1 to 3: mixed batches, conflict aggregation, DST wall time, time-like malformed lines, legacy `raw` preservation, text and JSON day and range entry semantics, `check` and `--dry-run`. Verify: every item maps to a test, and any gap is reopened in its owning group.
- [x] 4.4 Check the scope of the uncommitted changes (nothing is committed, so do not compare commits): `git status --porcelain=v1 --untracked-files=all` for every modified and untracked path, `git diff --stat` to inspect the tracked edits, and `git diff --check`, which must report nothing. The changes may contain only the files named in 1.1, 2.1 and 3.1 and the planning files under `openspec/changes/add-log-entry-time/`. It must not touch `insert.ts`, the check command, `@nomnom/core` exports beyond the design, generated rule files (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/`, `.agents/memories/`) or any data file. Verify: there are no unexpected paths.
- [x] 4.5 Run `openspec validate add-log-entry-time --strict --no-interactive`. Verify: it reports the change as valid with no warnings.
