## Why

nomnom's files are meant to be edited by hand, but nomnom only finds problems in the files a command happens to read. `report` checks the days in its range, `log` checks the day it writes to, and a food or recipe version is checked only when something pins it or lists it. A broken food, a dangling ingredient in an old recipe version, a bad day outside the reported range, or a day file saved under the wrong name goes unnoticed until it breaks something later. The old tool had `kcalops check` for this. Two catalog rules are also too lenient: a food version can lack a required nutrient or carry a misspelled nutrient id (`protien: 7`), and nothing ever reports either.

## What Changes

- Add `nomnom check`. It checks every file in the data directory at once, with no date range: `config.yaml`, every version of every food and recipe, every recipe ingredient, recipe cycles, slugs used by both a food and a recipe, barcodes held by more than one active food, and every `.nom` file under `logs/`. It changes no data file.
- `check` reports each problem once, where it lives. A reference that is itself wrong, such as an unknown slug, a missing version or a unit the version doesn't allow, is reported at every line or ingredient that makes it. A problem in the referenced item is reported only at that item, not at each of its referrers: an invalid file, an unusable food version (see below), or a recipe cycle, which is reported once per cycle.
- Output follows the existing error format. Warnings go to standard error as `warning: <file>:<line>: <message>`. Errors are reported as one user-fixable error, `<n> errors in <m> files`, with one located problem per line, and the exit status is 1. When there are no errors, `check` prints `No errors in <n> foods, <n> recipes and <n> day files` and exits with status 0, also when there are warnings. When `config.yaml` is invalid, `check` reports only its problems, since the other rules depend on it.
- **BREAKING** (data): a food version is *usable* only when it has every required nutrient of the current catalog and no nutrient id outside the catalog. Every command enforces this: a day entry or recipe ingredient that pins an unusable version is invalid, so `log`, `recipe add`, `report` and `recipe show` fail on it. Commands that only read or display foods (`food show`, `food list`, `search`, and the barcode checks in `food add` and `food update`) still work, so the food can be found and fixed. Making a nutrient required, or removing one from the catalog, now means editing the food files that are affected, including old versions. Until now, values under removed ids were ignored in calculations, and a missing required nutrient counted as 0.
- Every `.nom` file under `logs/`, at any depth, must be a day file at `logs/<yyyy>/<yyyy-mm-dd>.nom`. Any other `.nom` file is invalid. Commands that read a day compute its path from the date and never list `logs/`, so only `check` finds such files. `foods/` and `recipes/` already have the same rule for `.yaml` file names.
- Out of scope: a date range or other filters, JSON output, fixing problems automatically, warnings about unused foods or recipes, and checking recipe versions by calculating their nutrients. Cycles and ingredients are checked directly instead.

## Capabilities

### New Capabilities

- `check`: the `nomnom check` command, covering what it checks, how each problem is located and reported once, output and exit status.

### Modified Capabilities

- `foods`: a new requirement defines usable food versions (required nutrients present, no nutrient ids outside the catalog) and which commands reject unusable ones.
- `data-directory`: `Missing nutrient values count as zero` no longer lets values under ids outside the catalog be ignored; such a version is unusable.
- `daily-log`: a reference entry that pins a food version must pin a usable one; a new requirement for day file names under `logs/`.
- `recipes`: an ingredient that pins a food version must pin a usable one, for new ingredients and for the stored ingredients of every version.

## Impact

- `@nomnom/core`: a new check service, added to `createServices` and exported. One shared reference check (resolve, version, kind, unit, usable version) replaces the separate checks in `daylog/validate.ts` and `nutrition/nutrition.ts`. It tells the problems of the reference apart from those of its target, so `check` can leave out repeats. A pure usability check for food versions. `VersionedStore` reports every invalid file name in `foods/` and `recipes/` instead of the first one. A walk of `logs/` that sorts `.nom` files into day files and invalid names, and cycle detection over recipe versions.
- `@nomnom/cli`: a new `check` command.
- `report` needs no requirement change: it checks day files by the daily-log rules, so it picks up unusable versions through them.
- Other active changes: `log-multiple-entries` checks each `--entry` by the rules of a hand-written line, so it picks up the new rule without edits. `add-dry-run` doesn't affect `check`, which writes nothing apart from the default `config.yaml`, created as for any other read-only command.
- No new dependencies and no new `FileSystem` operations. No file format changes, but existing data can become invalid under the usability rule. `nomnom check` lists what needs fixing.
