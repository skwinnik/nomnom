## ADDED Requirements

### Requirement: Dry run of food commands
`food add`, `food update`, `food archive` and `food unarchive` SHALL accept `--dry-run`, with the behaviour and output defined by the `cli` spec. Each command SHALL print its usual output with the verbs in the conditional, and preview each food file it would write: a new file with its one YAML document, or an existing file with the new version document it would append after the existing text.

#### Scenario: Dry run of food add
- **WHEN** `nomnom food add --name Rice --base-unit g --kcal 360 --dry-run` runs
- **THEN** the output starts with `Would create <data>/foods/rice.yaml`, the preview shows `foods/rice.yaml` as a new file whose lines are the version 1 document with `per: 100` and `kcal: 360`, and `foods/rice.yaml` does not exist afterwards

#### Scenario: Dry run of food update
- **WHEN** `apple` has version 2 with `kcal: 52` and `nomnom food update apple --name Apple --base-unit g --kcal 55 --dry-run` runs
- **THEN** the output starts with `Would update <data>/foods/apple.yaml (version 3)` and `kcal` changing from 52 to 55, the preview of `foods/apple.yaml` shows the version 3 document as added lines after unchanged lines from version 2, and `foods/apple.yaml` is unchanged

#### Scenario: Dry run of a rename
- **WHEN** `nomnom food update apple --name 'Green Apple' --base-unit g --kcal 52 --dry-run` runs
- **THEN** the output starts with `Would create <data>/foods/green-apple.yaml` and `Would archive <data>/foods/apple.yaml (version 3)`, the preview shows `foods/green-apple.yaml` as a new file, then the archiving document added to `foods/apple.yaml`, and neither file is created or changed

#### Scenario: Dry run of food archive and unarchive
- **WHEN** `nomnom food archive apple --dry-run` runs and `apple` has 2 versions and is not archived
- **THEN** the output starts with `Would archive <data>/foods/apple.yaml (version 3)`, the preview shows the added version 3 document with `archived: true`, and the file is unchanged, and the same holds for `food unarchive` with `Would unarchive` and without `archived`

#### Scenario: Dry run of a rejected update
- **WHEN** `nomnom food update apple ... --dry-run` runs with values identical to the latest version of `apple`
- **THEN** the command fails with the error saying nothing changed, as without `--dry-run`
