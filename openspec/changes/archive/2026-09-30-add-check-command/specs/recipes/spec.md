## MODIFIED Requirements

### Requirement: Pinned ingredients
Every ingredient SHALL reference an exact version of a food or recipe. When `recipe add` receives an ingredient without a version, it SHALL pin the latest version at the time of adding. When a version is given, that version SHALL exist. The ingredient's unit SHALL be one that the referenced version allows. When the ingredient pins a food version, that version SHALL be usable (see the foods capability). These rules SHALL hold for the stored ingredients of every recipe version: calculating a version with an ingredient that breaks them SHALL fail with an error naming the recipe version and the ingredient.

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

#### Scenario: Unusable food version
- **WHEN** an ingredient is given as `carrot@1=100` and `carrot@1` stores a value under an id that is not in the catalog
- **THEN** the command fails with an error naming `carrot@1` and that id, and no file is created

#### Scenario: Stored ingredient became unusable
- **WHEN** `soup@1` pins `carrot@1`, `kcal` is then made required, `carrot@1` has no `kcal`, and `nomnom recipe show soup` runs
- **THEN** the command fails with an error naming `soup@1`, `carrot@1` and `kcal`
