## ADDED Requirements

### Requirement: Day file names
Every file under `logs/`, at any depth, whose name ends with `.nom` SHALL be a day file at `logs/<yyyy>/<yyyy-mm-dd>.nom`, where `<yyyy-mm-dd>` is a real calendar date and `<yyyy>` is its year. Any other `.nom` file under `logs/` SHALL be invalid, with an error naming the file and the expected layout. Other files and directories under `logs/` SHALL be ignored. Commands that read a day find its file from the date and don't list `logs/`; `nomnom check` lists it and reports invalid files.

#### Scenario: Date without leading zeros
- **WHEN** `logs/2026/2026-9-30.nom` exists and `nomnom check` runs
- **THEN** the file is reported as invalid

#### Scenario: Wrong year directory
- **WHEN** `logs/2025/2026-01-01.nom` exists and `nomnom check` runs
- **THEN** the file is reported as invalid

#### Scenario: Day file outside a year directory
- **WHEN** `logs/2026-09-30.nom` or `logs/old/2026-09-30.nom` exists and `nomnom check` runs
- **THEN** the file is reported as invalid

#### Scenario: Not a real date
- **WHEN** `logs/2026/2026-02-30.nom` exists and `nomnom check` runs
- **THEN** the file is reported as invalid

#### Scenario: Other files are ignored
- **WHEN** `logs/` contains `notes.txt`, `logs/2026/2026-09-30.nom~` and a directory `archive`
- **THEN** `nomnom check` reports none of them

## MODIFIED Requirements

### Requirement: Reference entries
A reference entry SHALL have the form `<slug>@<version> <amount> [<unit>]`, with tokens separated by whitespace. The version is required. The amount SHALL be a positive number. The unit is the rest of the line after the amount (excluding a trailing comment), normalised like unit names; when absent, the item's default unit is used (as for recipe ingredients). The slug SHALL resolve to a food or recipe in the shared namespace, the version SHALL exist, and the unit SHALL be allowed by that version. When the version is a food version, it SHALL be usable (see the foods capability).

#### Scenario: Pinned reference with a multi-word unit
- **WHEN** a line reads `apple@2 1 medium sized apple`
- **THEN** it is an entry for version 2 of `apple`, amount 1, unit `medium sized apple`

#### Scenario: Reference without a version
- **WHEN** a line reads `apple 1 medium sized apple`
- **THEN** parsing fails with an error naming the line number and explaining that a version is required

#### Scenario: Unit not allowed
- **WHEN** a line reads `apple@2 1 cup` and `apple@2` has no `cup` unit
- **THEN** validation fails with an error naming the line number and the unit

#### Scenario: Unusable food version
- **WHEN** a line reads `apple@1 150 g`, `kcal` is required and `apple@1` has no `kcal`
- **THEN** validation fails with an error naming the line number, `apple@1` and `kcal`
