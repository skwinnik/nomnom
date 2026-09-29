## MODIFIED Requirements

### Requirement: Recipe slugs
A recipe slug SHALL be derived from the name of the version being written, using the same rule as food slugs, with no barcode suffix. Recipe slugs SHALL share one namespace with food slugs. A version whose slug differs from the slug of the file being updated SHALL NOT be added to that file; it SHALL start a new file instead, as defined by the `recipe update` command.

#### Scenario: Slug collides with a food
- **WHEN** `foods/pancakes.yaml` exists and a recipe named `Pancakes` is added
- **THEN** the command fails with an error saying `pancakes` is already used by a food

#### Scenario: Name change that keeps the slug
- **WHEN** `chicken-soup` is updated with `--name 'Chicken soup'`
- **THEN** the new version is added to `recipes/chicken-soup.yaml`

## ADDED Requirements

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
