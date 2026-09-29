## Purpose

Defines recipes: versioned records built from pinned foods and other recipes, with an optional cooked yield and a number of servings, whose nutrients are calculated from their ingredients. Also defines the `nomnom recipe add` command.

## ADDED Requirements

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
A recipe slug SHALL be derived from its name using the same rule as food slugs, with no barcode suffix. Recipe slugs SHALL share one namespace with food slugs.

#### Scenario: Slug collides with a food
- **WHEN** `foods/pancakes.yaml` exists and a recipe named `Pancakes` is added
- **THEN** the command fails with an error saying `pancakes` is already used by a food

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
