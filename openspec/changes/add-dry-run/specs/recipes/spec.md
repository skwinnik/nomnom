## ADDED Requirements

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
