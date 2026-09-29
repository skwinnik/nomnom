## ADDED Requirements

### Requirement: Usable food versions
A food version SHALL be usable only when its `nutrients` contain every required nutrient of the current catalog and no id that is not in the catalog. Usability depends on the current `config.yaml`: making a nutrient required, or removing one from the catalog, can make existing versions unusable, including old and archived ones, and they are fixed by editing the file.

An unusable version SHALL NOT be referenced or used in a calculation: a day file entry or a recipe ingredient that pins it is invalid, and `log`, `recipe add` and `recipe update` SHALL reject a new reference to it. The error SHALL name the version as `<slug>@<version>` and each required nutrient that is missing and each id that is not in the catalog.

An unusable version SHALL NOT make its food file invalid. Commands that read or display foods without referencing them, such as `food show`, `food list`, `search` and the barcode checks of `food add` and `food update`, SHALL treat it like any other version.

#### Scenario: Nutrient made required later
- **WHEN** `apple@1` has no `kcal`, `kcal` is then made required in `config.yaml`, and a day file has the line `apple@1 150 g`
- **THEN** the day file is invalid, with a problem at that line naming `apple@1` and `kcal`

#### Scenario: Nutrient removed from the catalog
- **WHEN** `rice@2` has `sodium: 5` and `sodium` is removed from the catalog
- **THEN** `rice@2` is unusable, and a recipe that pins it can't be calculated

#### Scenario: Misspelled nutrient id
- **WHEN** a hand edit gives `rice@2` the value `protien: 7` and `nomnom log lunch rice@2 80` runs
- **THEN** the command fails with an error naming `rice@2` and `protien`, and nothing is written

#### Scenario: Unusable food can still be shown and listed
- **WHEN** the latest version of `apple` is unusable and `nomnom food show apple`, `nomnom food list` and `nomnom search apple` run
- **THEN** each command succeeds and includes `apple`

#### Scenario: Unusable food does not block adding another
- **WHEN** a version of `apple` is unusable and `nomnom food add --name Rice --base-unit g --kcal 360` runs
- **THEN** `foods/rice.yaml` is created
