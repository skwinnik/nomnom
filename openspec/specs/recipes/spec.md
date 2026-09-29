# recipes Specification

## Purpose

Defines recipes: versioned records built from pinned foods and other recipes, with an optional cooked yield and a number of servings, whose nutrients are calculated from their ingredients. Also defines the `nomnom recipe add` command.

## Requirements

### Requirement: Recipe file format
Each recipe SHALL be stored in `recipes/<slug>.yaml`, using the same versioning rules as foods: one YAML document per version, each starting with `---`, each a full snapshot, existing documents never modified. Each document SHALL contain:
- `version`, `created`, `name`, and `archived` (optional), with the same meaning as for foods
- `servings`: positive number
- `base_unit` and `yield`: the cooked amount in the recipe's base unit; either both present or both absent; `yield` is positive
- `units`: map of unit name to a positive amount of base units; allowed only when `yield` is present, omitted when empty
- `ingredients`: non-empty list; each item has exactly one of `food: <slug>` or `recipe: <slug>`, plus `version`, `amount` (positive number) and `unit`

Nutrient values SHALL NOT be stored in recipe files.

#### Scenario: File written by recipe add
- **WHEN** `nomnom recipe add --name 'Chicken Soup' --base-unit g --yield 1000 --servings 4 --ingredient 'chicken-breast=300 g' --ingredient 'carrot=2 medium carrot'` runs, and the latest versions are `chicken-breast@2` and `carrot@1`
- **THEN** `recipes/chicken-soup.yaml` contains a single document with `version: 1`, `servings: 4`, `base_unit: g`, `yield: 1000`, and two ingredients: `food: chicken-breast, version: 2, amount: 300, unit: g` and `food: carrot, version: 1, amount: 2, unit: medium carrot`

### Requirement: Recipe slugs
A recipe slug SHALL be derived from the name of the version being written, using the same rule as food slugs, with no barcode suffix. Recipe slugs SHALL share one namespace with food slugs. A version whose slug differs from the slug of the file being updated SHALL NOT be added to that file; it SHALL start a new file instead, as defined by the `recipe update` command.

#### Scenario: Slug collides with a food
- **WHEN** `foods/pancakes.yaml` exists and a recipe named `Pancakes` is added
- **THEN** the command fails with an error saying `pancakes` is already used by a food

#### Scenario: Name change that keeps the slug
- **WHEN** `chicken-soup` is updated with `--name 'Chicken soup'`
- **THEN** the new version is added to `recipes/chicken-soup.yaml`

### Requirement: Pinned ingredients
Every ingredient SHALL reference an exact version of a food or recipe. When `recipe add` receives an ingredient without a version, it SHALL pin the latest version at the time of adding. When a version is given, that version SHALL exist. The ingredient's unit SHALL be one that the referenced version allows.

#### Scenario: Explicit version
- **WHEN** an ingredient is given as `carrot@1=2 medium carrot` and `carrot` has versions 1 and 2
- **THEN** the ingredient is stored with `version: 1`

#### Scenario: Version that does not exist
- **WHEN** an ingredient is given as `carrot@7=2` and `carrot` has only versions 1 and 2
- **THEN** the command fails with an error naming `carrot@7` and no file is created

#### Scenario: Unknown reference
- **WHEN** an ingredient is given as `unicorn=1`
- **THEN** the command fails with an error saying `unicorn` is neither a food nor a recipe

#### Scenario: Unit not allowed
- **WHEN** an ingredient is given as `carrot=2 cup` and `carrot@1` has no unit named `cup`
- **THEN** the command fails with an error listing the units `carrot@1` allows

### Requirement: Nested recipes
An ingredient SHALL be allowed to reference a recipe version. Nutrient calculation SHALL resolve nested recipes recursively. When the reference chain of a recipe version leads back to a version already on the chain, the calculation SHALL fail with an error naming the cycle instead of looping.

#### Scenario: Recipe containing a recipe
- **WHEN** `soup@1` has the ingredient `chicken-stock@1`, 500 g, and `chicken-stock@1` has a yield of 2000 g
- **THEN** `soup@1` includes a quarter of the total nutrients of `chicken-stock@1`

#### Scenario: Cycle in hand-edited files
- **WHEN** hand-edited files make `a@1` reference `b@1` and `b@1` reference `a@1`
- **THEN** calculating either recipe fails with an error naming `a@1` and `b@1`

### Requirement: Yield, servings and recipe units
A recipe SHALL always allow the unit `serving`, worth `1 / servings` of the recipe. `servings` SHALL default to 1. When `yield` is present, the recipe SHALL also allow its base unit (factor 1) and its additional units, and one `serving` SHALL equal `yield / servings` base units. When `yield` is absent, `serving` SHALL be the only allowed unit. `serving` SHALL be reserved: neither the base unit nor an additional unit of a recipe may be named `serving`. Unit name rules for recipes SHALL match those for foods.

#### Scenario: Serving with a yield
- **WHEN** a recipe has `yield: 1000`, `base_unit: g` and `servings: 4`
- **THEN** it allows `g`, `serving` and its additional units, and 1 serving equals 250 g

#### Scenario: Recipe without a yield
- **WHEN** a recipe is added with `--servings 2` and neither `--yield` nor `--base-unit`
- **THEN** it allows only the unit `serving`

#### Scenario: Yield without a base unit
- **WHEN** a recipe is added with `--yield 1000` but no `--base-unit`
- **THEN** the command fails with an error explaining that `--yield` and `--base-unit` must be given together

#### Scenario: Units without a yield
- **WHEN** a recipe is added with `--units bowl=350` and no `--yield`
- **THEN** the command fails with an error explaining that units need a yield

#### Scenario: Reserved unit name
- **WHEN** a recipe is added with `--units serving=300`
- **THEN** the command fails with an error explaining that `serving` is reserved

### Requirement: Recipe nutrient calculation
The total nutrients of a recipe version SHALL be the sum of its ingredients' contributions. A food ingredient contributes `nutrient * (amount * unit factor) / per` for each nutrient, with absent nutrients counting as 0. A recipe ingredient contributes the nested recipe's totals multiplied by the fraction of that recipe consumed: `amount * unit factor / yield` for base units and additional units, or `amount / servings` for `serving`. Per-serving values SHALL be totals divided by `servings`. When `yield` is present, per-base-unit values SHALL be totals divided by `yield`. Only nutrients in the current catalog SHALL be calculated.

#### Scenario: Soup example
- **WHEN** a recipe has `yield: 1000`, `base_unit: g`, `servings: 4`, and ingredients `chicken-breast@2` 300 g (165 kcal per 100 g), `carrot@1` 2 `medium carrot` (61 g each, 41 kcal per 100 g) and `water@1` 700 ml (0 kcal)
- **THEN** its total is 545.02 kcal, one serving is about 136.3 kcal, and 100 g is about 54.5 kcal

### Requirement: recipe add command
`nomnom recipe add` SHALL create a new recipe at version 1, print the path of the created file, and print its nutrients per serving and, when a yield is given, per 100 base units. It SHALL accept:
- `--name <text>` (required)
- `--ingredient '<slug>[@<version>]=<amount> [<unit>]'` (repeatable, at least one): the text is split at the first `=`; after it come a positive number and optionally a unit name (the rest of the text); with no unit, the referenced item's default unit is used: the base unit for foods and recipes with a yield, `serving` for recipes without one
- `--servings <number>` (optional, default 1, positive)
- `--base-unit <unit>` and `--yield <number>` (optional, together)
- `--units <name>=<amount>` (repeatable, requires a yield; parsed as for foods)

Stored ingredients SHALL always include the unit, even when it was omitted on the command line. The command SHALL fail without writing anything when any ingredient is invalid, references an archived item, or when the new recipe's nutrients can't be calculated.

#### Scenario: Ingredient without a unit
- **WHEN** an ingredient is given as `rice=80` and the base unit of `rice` is `g`
- **THEN** it is stored with `amount: 80` and `unit: g`

#### Scenario: Nested recipe without a yield, given in servings
- **WHEN** an ingredient is given as `pancake-batter=0.5 serving` and `pancake-batter` is a recipe without a yield
- **THEN** it is stored with `recipe: pancake-batter`, `amount: 0.5` and `unit: serving`

#### Scenario: No ingredients
- **WHEN** `nomnom recipe add --name Empty` runs without `--ingredient`
- **THEN** the command fails with an error and no file is created

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

### Requirement: recipe update command
`nomnom recipe update <slug>` SHALL write a new version of the recipe with slug `<slug>`. It SHALL accept exactly the options of `recipe add`, with the same defaults and validation, and the values given SHALL form the complete new version: no field SHALL be carried over from the previous version. Ingredients SHALL be pinned by the same rules as in `recipe add`: an ingredient without a version pins the latest version, an explicit version must exist, and archived items are rejected. An ingredient SHALL NOT reference `<slug>` itself, in any version. The command SHALL fail without writing anything when:
- `<slug>` is not a recipe (the error SHALL say when it is a food, and when it is neither)
- the recipe is archived
- any value or ingredient is invalid, or the new version's nutrients can't be calculated, as for `recipe add`
- the slug derived from the new name is unchanged and the new version is identical to the latest version: every field except `version` and `created` is equal, with units compared regardless of order and ingredients compared in order

When the derived slug equals `<slug>`, the command SHALL add the new version to `recipes/<slug>.yaml` and print that path and the new version number. When the derived slug differs, the command SHALL create a new file for the new slug at version 1, then add an archiving version to the old recipe as `recipe archive` does, and print the path of the new file and the path and version of the archived one.

In both cases the command SHALL then print every field that differs from the latest version of the old recipe, with its previous and new value: the name, `servings`, the base unit, `yield`, each unit (added, removed or changed), and the ingredients that were added or removed, each shown with its pinned version, amount and unit. When the ingredients differ only in order, it SHALL say that their order changed. Finally, it SHALL print the new version's nutrients as `recipe add` does.

#### Scenario: New version with re-listed ingredients
- **WHEN** `chicken-soup@1` pins `carrot@1`, `carrot` now has version 2, and `recipe update chicken-soup` runs with the same options as before, including `--ingredient 'carrot=2 medium carrot'`
- **THEN** `recipes/chicken-soup.yaml` gets version 2 pinning `carrot@2`, and the output reports the ingredient `carrot@1 2 medium carrot` as removed and `carrot@2 2 medium carrot` as added, followed by the new nutrients

#### Scenario: Explicit older version kept
- **WHEN** `recipe update chicken-soup` runs with `--ingredient 'carrot@1=2 medium carrot'` and `carrot` has versions 1 and 2
- **THEN** the new version pins `carrot@1`

#### Scenario: Archived ingredient
- **WHEN** `chicken-soup@1` pins `carrot@1`, `carrot` is archived, and `recipe update chicken-soup` runs with `--ingredient 'carrot@1=2 medium carrot'`
- **THEN** the command fails with an error saying `carrot` is archived, and the file is unchanged

#### Scenario: Recipe referencing itself
- **WHEN** `recipe update chicken-soup` runs with `--ingredient 'chicken-soup@1=1 serving'`
- **THEN** the command fails with an error saying a recipe can't contain itself, and the file is unchanged

#### Scenario: Omitted yield is not carried over
- **WHEN** `chicken-soup@1` has `yield: 1000` and `base_unit: g`, and it is updated without `--yield` and `--base-unit`
- **THEN** version 2 has no yield and allows only the unit `serving`, and the output reports the base unit and yield as removed

#### Scenario: Rename creates a new file
- **WHEN** `nomnom recipe update chicken-soup --name 'Chicken Noodle Soup' ...` runs
- **THEN** `recipes/chicken-noodle-soup.yaml` is created with version 1, `recipes/chicken-soup.yaml` gets a new version with the values of its latest version and `archived: true`, and the output names both files

#### Scenario: Existing references are unchanged
- **WHEN** another recipe and a day file pin `chicken-soup@1` and `chicken-soup` is updated or renamed
- **THEN** both files are unchanged and still resolve `chicken-soup@1`

#### Scenario: Identical update
- **WHEN** `chicken-soup` is updated with values and ingredient pins identical to its latest version
- **THEN** the command fails with an error saying nothing changed, and the file is unchanged

#### Scenario: Archived recipe
- **WHEN** the latest version of `chicken-soup` is archived and `chicken-soup` is updated
- **THEN** the command fails with an error saying `chicken-soup` is archived and must be unarchived first, and no file is created or changed

#### Scenario: Slug of a food
- **WHEN** `nomnom recipe update apple ...` runs and `apple` is a food
- **THEN** the command fails with an error saying `apple` is a food

### Requirement: recipe archive and unarchive commands
`nomnom recipe archive <slug>` SHALL add a new version to the recipe that copies every field of its latest version except `version` and `created`, including its ingredient pins, with `archived: true`, and print the path of the file and the new version number. `nomnom recipe unarchive <slug>` SHALL do the same with `archived` omitted. Copied ingredient pins SHALL NOT count as new references, so they are kept even when the items they reference are archived. Archiving an archived recipe, unarchiving a recipe that is not archived, and either command on a slug that is not a recipe SHALL fail without writing anything.

#### Scenario: Archive a recipe
- **WHEN** `chicken-soup` has version 2 and `nomnom recipe archive chicken-soup` runs
- **THEN** `recipes/chicken-soup.yaml` gets version 3 with the values and ingredient pins of version 2 and `archived: true`, and new references to `chicken-soup` are rejected

#### Scenario: Unarchive a recipe with an archived ingredient
- **WHEN** `chicken-soup` is archived, its latest version pins `carrot@1`, `carrot` is archived, and `nomnom recipe unarchive chicken-soup` runs
- **THEN** `chicken-soup` gets a new version without `archived` that still pins `carrot@1`

#### Scenario: Already archived
- **WHEN** `chicken-soup` is archived and `nomnom recipe archive chicken-soup` runs
- **THEN** the command fails with an error saying `chicken-soup` is already archived, and the file is unchanged

#### Scenario: Slug of a food
- **WHEN** `nomnom recipe archive apple` runs and `apple` is a food
- **THEN** the command fails with an error saying `apple` is a food

### Requirement: Dry run of recipe commands
`recipe add`, `recipe update`, `recipe archive` and `recipe unarchive` SHALL accept `--dry-run`, with the behaviour and output defined by the `cli` spec. Each command SHALL print its usual output with the verbs in the conditional, including the nutrients that `recipe add` and `recipe update` print, and preview each recipe file it would write: a new file with its one YAML document, or an existing file with the new version document it would append after the existing text. Ingredients SHALL be pinned and checked as in a real run.

#### Scenario: Dry run of recipe add
- **WHEN** `nomnom recipe add --name Porridge --ingredient oats=60 --ingredient 'milk=200 ml' --dry-run` runs and the latest versions of `oats` and `milk` are 2 and 1
- **THEN** the output starts with `Would create <data>/recipes/porridge.yaml` followed by the nutrients per serving, the preview shows `recipes/porridge.yaml` as a new file whose document pins `oats` at version 2 and `milk` at version 1, and `recipes/porridge.yaml` does not exist afterwards

#### Scenario: Dry run of recipe update
- **WHEN** `chicken-soup` has version 1 and `nomnom recipe update chicken-soup ... --dry-run` runs with a changed value
- **THEN** the output starts with `Would update <data>/recipes/chicken-soup.yaml (version 2)`, then the changes and the nutrients, the preview shows the version 2 document as added lines, and the file is unchanged

#### Scenario: Dry run with an archived ingredient
- **WHEN** `nomnom recipe add ... --ingredient old-bread=50 --dry-run` runs and `old-bread` is archived
- **THEN** the command fails with the same error as without `--dry-run`, and no file is created

#### Scenario: Dry run of recipe archive
- **WHEN** `nomnom recipe archive chicken-soup --dry-run` runs and `chicken-soup` has 1 version and is not archived
- **THEN** the output starts with `Would archive <data>/recipes/chicken-soup.yaml (version 2)`, the preview shows the added version 2 document with its ingredient pins and `archived: true`, and the file is unchanged
