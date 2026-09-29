## ADDED Requirements

### Requirement: Invalid recipe files
A command that reads a recipe file SHALL fail when that file is invalid, with an error naming the file, and SHALL NOT write anything. A command that reads every recipe, such as `recipe list`, SHALL fail when any recipe file is invalid. In `recipes/`, every file whose name ends with `.yaml` SHALL be a recipe file; a recipe file whose name without `.yaml` is not a valid slug SHALL be invalid. Other files and directories in `recipes/` SHALL be ignored.

#### Scenario: One broken file fails the list
- **WHEN** `recipes/soup.yaml` is valid, `recipes/stew.yaml` contains invalid YAML, and `nomnom recipe list` runs
- **THEN** the command fails with an error naming `recipes/stew.yaml` and prints no list

#### Scenario: Other files are ignored
- **WHEN** `recipes/` contains `notes.txt` and a directory `old`
- **THEN** `nomnom recipe list` ignores both

### Requirement: recipe list command
`nomnom recipe list` SHALL print every non-archived recipe, one line each, sorted by slug in code point order. Each line SHALL be `<slug>@<latest version>`, the kind `recipe`, and the name of the latest version, in that order, as columns aligned across the output and separated by at least two spaces. The name SHALL come last and be printed in full. When there is no non-archived recipe, the command SHALL print `No recipes` and exit with status 0.

#### Scenario: Recipes listed
- **WHEN** recipes `chicken-soup` (version 1, named `Chicken Soup`) and `pancakes` (versions 1 to 3, named `Pancakes`) exist and `nomnom recipe list` runs
- **THEN** standard output is:
  ```
  chicken-soup@1  recipe  Chicken Soup
  pancakes@3      recipe  Pancakes
  ```

#### Scenario: Archived recipe is not listed
- **WHEN** the latest version of `pancakes` is archived and `nomnom recipe list` runs
- **THEN** `pancakes` is not in the output

#### Scenario: Foods are not listed
- **WHEN** the food `apple` exists and `nomnom recipe list` runs
- **THEN** `apple` is not in the output

#### Scenario: No recipes
- **WHEN** `recipes/` is empty or missing and `nomnom recipe list` runs
- **THEN** standard output is `No recipes` and the exit status is 0

### Requirement: recipe show command
`nomnom recipe show <slug>[@<version>]` SHALL print one version of a recipe: the given version, or the latest one when no version is given. It SHALL read only recipes: a slug that isn't a recipe, including a food's slug, SHALL fail with an error saying there is no recipe with that slug. A version that doesn't exist SHALL fail with an error naming it. Archived recipes SHALL be shown like any other. The output SHALL contain, in this order:
- a header line with the same columns as `recipe list`: `<slug>@<version>`, `recipe` and the name of the shown version
- `Created: <timestamp>` of the shown version
- `Latest version: <n>`, only when the shown version is not the latest
- `Archived: yes`, only when the recipe is archived
- `Servings: <servings>`
- `Yield: <yield> <base unit>`, only when the version has a yield
- `Units:` followed by every unit the version allows: with a yield, the base unit marked `base unit`, then `serving` with its size in base units, then each additional unit in stored order with its size in base units; without a yield, `serving` alone
- `Ingredients:` followed by one line per ingredient in stored order: `<slug>@<version>`, then its amount and unit
- the calculated nutrients of the version, in the same format as `recipe add` prints them: per serving, and per 100 base units when the version has a yield

The command SHALL fail with an error when the version's nutrients can't be calculated.

#### Scenario: Recipe with a yield
- **WHEN** `chicken-soup@1` was created at `2026-09-29T20:10:00+03:00` with `servings: 4`, `yield: 1000`, `base_unit: g`, the unit `bowl: 350`, and the ingredients `chicken-breast@2` 300 g, `carrot@1` 2 `medium carrot` and `water@1` 700 ml, and `nomnom recipe show chicken-soup` runs
- **THEN** standard output starts with:
  ```
  chicken-soup@1  recipe  Chicken Soup
  Created: 2026-09-29T20:10:00+03:00
  Servings: 4
  Yield: 1000 g
  Units:
    g        base unit
    serving  250 g
    bowl     350 g
  Ingredients:
    chicken-breast@2  300 g
    carrot@1          2 medium carrot
    water@1           700 ml
  ```
  followed by the nutrients per serving and per 100 g

#### Scenario: Recipe without a yield
- **WHEN** `pancake-batter@1` has `servings: 2` and no yield, and `nomnom recipe show pancake-batter` runs
- **THEN** the output has no `Yield:` line, `Units:` lists only `serving`, and nutrients are printed per serving only

#### Scenario: Older version
- **WHEN** `pancakes` has versions 1 to 3 and `nomnom recipe show pancakes@1` runs
- **THEN** the header starts with `pancakes@1`, the values are those of version 1, and the output contains `Latest version: 3`

#### Scenario: Archived recipe
- **WHEN** the latest version of `pancakes` is archived and `nomnom recipe show pancakes` runs
- **THEN** the recipe is shown and the output contains `Archived: yes`

#### Scenario: Slug of a food
- **WHEN** `apple` is a food and `nomnom recipe show apple` runs
- **THEN** the command fails with an error saying there is no recipe `apple`, the same as for a slug that doesn't exist, and the exit status is 1

#### Scenario: Nutrients can't be calculated
- **WHEN** hand-edited files make `a@1` reference `b@1` and `b@1` reference `a@1`, and `nomnom recipe show a` runs
- **THEN** the command fails with an error naming the cycle
