# check Specification

## Purpose

Defines `nomnom check`, which checks every file in the data directory at once against the rules of the other capabilities, so problems in hand-edited files are found even in files no other command has read.

## Requirements

### Requirement: check command
`nomnom check` SHALL check all data in the data directory. It SHALL take no positional arguments and no options other than help, and it SHALL always cover all data, with no date range. It SHALL NOT create or modify day files, foods or recipes. Archived foods and recipes SHALL be checked like any other.

#### Scenario: Clean data
- **WHEN** every file in the data directory is valid and `nomnom check` runs
- **THEN** the command succeeds and changes no file

#### Scenario: Problem outside any reported range
- **WHEN** `logs/2025/2025-03-02.nom` has an error on line 4, no command has read that day since, and `nomnom check` runs
- **THEN** the problem is reported with `logs/2025/2025-03-02.nom` and line 4

### Requirement: What check covers
`nomnom check` SHALL check, by the rules of the capability that defines each one:
- `config.yaml` (data-directory). When it is invalid, the command SHALL fail with the problems of `config.yaml` only and check nothing else.
- every file in `foods/` and `recipes/`: its name and every version (foods, recipes)
- every version of every food: that it is usable (foods)
- slugs used by both a food and a recipe (foods)
- barcodes: that no normalized barcode belongs to more than one non-archived food (foods)
- every ingredient of every version of every recipe: that it references an existing version of an item of its kind, in a unit that version allows, and that a food version it pins is usable (recipes)
- cycles among recipe versions (recipes)
- every file under `logs/` whose name ends with `.nom`: its location (daily-log), and the contents of every day file (daily-log)

#### Scenario: Broken food nobody references
- **WHEN** `foods/rice.yaml` contains invalid YAML, no recipe or day file references `rice`, and `nomnom check` runs
- **THEN** the command fails with a problem naming `foods/rice.yaml`

#### Scenario: Old recipe version with a dangling ingredient
- **WHEN** version 1 of `soup` has the ingredient `carrot@7`, `carrot` has only versions 1 and 2, and version 2 of `soup` is valid
- **THEN** the command fails with a problem naming `recipes/soup.yaml`, version 1 and `carrot@7`

#### Scenario: Old food version without a required nutrient
- **WHEN** `kcal` is required and version 1 of `apple` has no `kcal`
- **THEN** the command fails with a problem naming `foods/apple.yaml`, version 1 and `kcal`

#### Scenario: Unknown nutrient id in a food
- **WHEN** version 2 of `rice` has `protien: 7` and `protien` is not in the catalog
- **THEN** the command fails with a problem naming `foods/rice.yaml`, version 2 and `protien`

#### Scenario: Duplicate barcode
- **WHEN** hand-edited files give the non-archived foods `cola-1` and `cola-2` barcodes that normalize to `4601234567890`
- **THEN** the command fails with one problem naming `foods/cola-1.yaml`, the barcode and `cola-2@<latest version>`

#### Scenario: Day file with a wrong name
- **WHEN** `logs/2026/2026-9-30.nom` exists
- **THEN** the command fails with a problem naming `logs/2026/2026-9-30.nom` and explaining that day files are `logs/<yyyy>/<yyyy-mm-dd>.nom`

#### Scenario: Invalid config
- **WHEN** `config.yaml` contains invalid YAML and `foods/rice.yaml` is also invalid
- **THEN** the command fails with the problems of `config.yaml` and does not report `foods/rice.yaml`

### Requirement: Each problem is reported once
A problem in a reference itself SHALL be reported at every day file line or recipe ingredient that makes it: an unknown slug, a version that doesn't exist, an item of the other kind, or a unit the version doesn't allow. A problem in the referenced item SHALL be reported only at that item, not at the lines or ingredients that reference it: an invalid food or recipe file, a slug used by both a food and a recipe, or an unusable food version. Recipe versions that reference each other in cycles SHALL be reported together, once per group: a group is every version that can reach each of the others through ingredients, or a single version that pins itself. Each group SHALL be reported at its version whose `<slug>@<version>` comes first in code point order, with a message naming every version in the group. Each barcode held by several non-archived foods SHALL be reported once, at the food whose slug comes first, naming the other foods as `<slug>@<latest version>`. A problem found in a food or recipe version after its file was read SHALL name the version.

#### Scenario: Broken food referenced by many days
- **WHEN** `foods/apple.yaml` is invalid and 60 day file lines pin `apple@3`
- **THEN** the problems of `foods/apple.yaml` are reported once, and none of the 60 lines is reported

#### Scenario: Unusable version referenced by a recipe
- **WHEN** `apple@1` has no `kcal`, `kcal` is required, and the recipe `pie@1` pins `apple@1`
- **THEN** the problem is reported at `foods/apple.yaml` and not at `recipes/pie.yaml`

#### Scenario: Wrong unit on many lines
- **WHEN** two day files each have a line `apple@2 1 cup` and `apple@2` has no `cup` unit
- **THEN** each of the two lines is reported with its file and line number

#### Scenario: Cycle reported once
- **WHEN** hand-edited files make `a@1` reference `b@1` and `b@1` reference `a@1`, and the recipe `soup@1` contains `a@1`
- **THEN** one problem is reported, at `recipes/a.yaml`, naming `a@1` and `b@1`, and nothing is reported for `b` or `soup`

#### Scenario: Cycles sharing recipes
- **WHEN** hand-edited files make `a@1` reference `b@1` and `c@1`, `c@1` reference `b@1`, and `b@1` reference `a@1`
- **THEN** one problem is reported, at `recipes/a.yaml`, naming `a@1`, `b@1` and `c@1`

### Requirement: check output and exit status
Warnings SHALL be printed to standard error as `warning: <file>:<line>: <message>`, leaving out `:<line>` when the problem has no line, and SHALL NOT make the command fail. When there are errors, the command SHALL fail as a user-fixable error (see the cli capability) with the message `<n> errors in <m> files` and every error as a located problem. The errors SHALL be listed by file: `config.yaml`, then food files by slug, then recipe files by slug, then files under `logs/` by path, with all problems of one file together. When there are no errors, the command SHALL print `No errors in <n> foods, <n> recipes and <n> day files` to standard output, counting the files it checked, and exit with status 0. Counts of one SHALL use the singular (`1 error`, `1 file`, `1 food`, `1 recipe`, `1 day file`).

#### Scenario: Errors and warnings
- **WHEN** a day file has a `[brunch]` section, `brunch` is not a configured meal, `foods/rice.yaml` has one error, and a day file has errors on lines 3 and 7
- **THEN** standard error has a warning naming `brunch`, then `3 errors in 2 files`, then the problem of `foods/rice.yaml` before the two day file problems, and the exit status is 1

#### Scenario: Warnings only
- **WHEN** the only problem is a section for a meal that is not configured, with 12 foods, 3 recipes and 40 day files
- **THEN** standard error has the warning, standard output is `No errors in 12 foods, 3 recipes and 40 day files`, and the exit status is 0

#### Scenario: Empty data directory
- **WHEN** the data directory has no foods, recipes or day files and `nomnom check` runs
- **THEN** standard output is `No errors in 0 foods, 0 recipes and 0 day files` and the exit status is 0
