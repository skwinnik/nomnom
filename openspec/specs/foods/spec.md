# foods Specification

## Purpose

Defines food records: immutable, versioned entries with typed-in nutrient values per amount of a base unit and named units that convert to it, stored one file per food, and the `nomnom food add` command that creates them.

## Requirements

### Requirement: Food file format
Each food SHALL be stored in `foods/<slug>.yaml`. The file SHALL contain one YAML document per version, each starting with a `---` line, in ascending version order. Each document SHALL be a full snapshot with these fields:
- `version`: positive integer, starting at 1 and increasing by 1
- `created`: ISO 8601 timestamp with a UTC offset
- `name`: non-empty display name
- `barcodes`: list of barcode strings, omitted when empty
- `base_unit`: the base unit name
- `per`: positive number of base units that the nutrient values refer to
- `nutrients`: map of nutrient id to non-negative number, containing only the values that were given
- `units`: map of unit name to a positive amount of base units, omitted when empty
- `archived`: `true` on a version that archives the food, otherwise omitted

#### Scenario: File written by food add
- **WHEN** `nomnom food add --name Apple --base-unit g --per 100 --kcal 52 --protein 0.3 --units 'small sized apple'=134` runs
- **THEN** `foods/apple.yaml` contains a single document starting with `---`, with `version: 1`, a `created` timestamp, `name: Apple`, `base_unit: g`, `per: 100`, `nutrients` with only `kcal: 52` and `protein: 0.3`, and `units` with `small sized apple: 134`

#### Scenario: Reading a specific version
- **WHEN** `foods/apple.yaml` holds versions 1 and 2 and version 1 is requested
- **THEN** the system returns the values of the version 1 document, unaffected by version 2

### Requirement: Food versions are immutable
The system SHALL NOT modify or remove an existing version document. New versions SHALL only be added as new documents after the existing ones. A new version SHALL be numbered one more than the latest version in the file. When the existing text does not end with a newline, the system SHALL add one before the new document, so the new `---` line starts on its own line. The system SHALL NOT add a version to a file that fails to parse or validate; it SHALL report the file's errors instead.

#### Scenario: Existing versions are preserved byte for byte
- **WHEN** any nomnom command runs against a food file
- **THEN** the bytes of every existing version document in that file are unchanged

#### Scenario: Version appended after the existing ones
- **WHEN** `foods/apple.yaml` holds versions 1 and 2 and a new version is added
- **THEN** the file ends with a new document with `version: 3`, and the text before it is exactly the previous content of the file

#### Scenario: Hand-edited file without a final newline
- **WHEN** `foods/apple.yaml` does not end with a newline and a new version is added
- **THEN** a newline is written before the new document's `---` line, and the file reads back with every earlier version unchanged

#### Scenario: Invalid file
- **WHEN** `foods/apple.yaml` contains an invalid document and a new version is added
- **THEN** the command fails with an error naming the file and the problem, and the file is unchanged

### Requirement: Slugs and filenames
The slug of a food SHALL be derived from the name and barcodes of the version being written: lowercase the name, replace every run of characters that are not Unicode letters or digits with `-`, and remove leading and trailing `-`. When the version has at least one barcode, `-` followed by the first barcode SHALL be appended. A name that yields an empty slug SHALL be rejected. A version whose slug differs from the slug of the file being updated SHALL NOT be added to that file; it SHALL start a new file instead, as defined by the `food update` command.

#### Scenario: Name with spaces and punctuation
- **WHEN** a food named `Greek Yogurt 2%` is added without a barcode
- **THEN** its file is `foods/greek-yogurt-2.yaml`

#### Scenario: Name with barcodes
- **WHEN** a food named `Greek Yogurt 2%` is added with barcodes `4601234567890` and `4601234567906`
- **THEN** its file is `foods/greek-yogurt-2-4601234567890.yaml`

#### Scenario: Non-Latin name
- **WHEN** a food named `Творог 5%` is added
- **THEN** its file is `foods/творог-5.yaml`

#### Scenario: Name with no letters or digits
- **WHEN** a food named `%%%` is added without a barcode
- **THEN** the command fails with an error and no file is created

#### Scenario: Name change that keeps the slug
- **WHEN** `apple` is updated with `--name 'APPLE'`
- **THEN** the new version is added to `foods/apple.yaml`

#### Scenario: Second barcode keeps the slug
- **WHEN** a food with slug `milk-4600000000001` and barcode `4600000000001` is updated with barcodes `4600000000001` and `4600000000002`
- **THEN** the new version is added to `foods/milk-4600000000001.yaml`

### Requirement: Shared namespace
Food and recipe slugs SHALL share one namespace. Creating a food or a recipe, whether by `add` or by an update that changes the slug, SHALL fail when a file with the same slug exists in either `foods/` or `recipes/`, including archived ones.

#### Scenario: Food already exists
- **WHEN** `foods/apple.yaml` exists and a food named `Apple` is added
- **THEN** the command fails with an error saying `apple` already exists, and the existing file is unchanged

#### Scenario: Recipe with the same slug exists
- **WHEN** `recipes/pancakes.yaml` exists and a food named `Pancakes` is added
- **THEN** the command fails with an error saying `pancakes` is already used by a recipe

#### Scenario: Rename onto an archived item
- **WHEN** `foods/green-apple.yaml` exists and is archived, and `apple` is updated with `--name 'Green Apple'`
- **THEN** the command fails with an error saying `green-apple` already exists, and no file is created or changed

### Requirement: Units
A food SHALL always allow its base unit, with a factor of 1. Additional units SHALL map a unit name to a positive amount of base units. Unit names, including the base unit name, SHALL be arbitrary strings of any length, subject to these rules: surrounding whitespace is trimmed, internal whitespace runs are collapsed to a single space, and the result is non-empty and contains no `#`. Unit names are case-sensitive. A food SHALL NOT define the same unit name twice, and SHALL NOT define its base unit name as an additional unit.

#### Scenario: Long and short unit names
- **WHEN** a food is added with `--units 100g=100 --units 'small sized apple'=134`
- **THEN** the food allows the units `g` (its base unit), `100g` and `small sized apple`

#### Scenario: Unit name with a hash
- **WHEN** a food is added with `--units 'can #2'=400`
- **THEN** the command fails with an error explaining that unit names can't contain `#`

#### Scenario: Duplicate unit
- **WHEN** a food is added with `--units cup=240 --units cup=250`
- **THEN** the command fails with an error naming the duplicate unit

#### Scenario: Redefining the base unit
- **WHEN** a food with base unit `g` is added with `--units g=1`
- **THEN** the command fails with an error explaining that `g` is already the base unit

### Requirement: Archived foods
A food SHALL be archived when its latest version has `archived: true`. The CLI SHALL reject new references to an archived food, and existing pinned references to any of its versions SHALL continue to resolve.

#### Scenario: Pinned reference to an archived food
- **WHEN** a recipe pins `apple@1` and the latest version of `apple` is archived
- **THEN** the recipe's nutrients are still calculated using `apple@1`

#### Scenario: New reference to an archived food
- **WHEN** `nomnom recipe add` or `nomnom log` references `apple` and its latest version is archived
- **THEN** the command fails with an error saying `apple` is archived

### Requirement: food add command
`nomnom food add` SHALL create a new food at version 1 and print the path of the created file. It SHALL accept:
- `--name <text>` (required)
- `--base-unit <unit>` (required)
- `--per <number>` (optional, default 100, positive)
- `--<nutrient-id> <number>` for every nutrient in the catalog (non-negative)
- `--units <name>=<amount>` (repeatable; the text is split at its last `=`; the amount must be a positive number)
- `--barcode <digits>` (repeatable; digits only; stored as strings, keeping leading zeros; two barcodes that are the same after normalization are rejected; a barcode that a non-archived food already has is rejected)

The command SHALL fail without writing anything when a required nutrient is missing, an option is not recognised (including a nutrient id that is not in the catalog), or any value is invalid.

#### Scenario: Minimal food
- **WHEN** `nomnom food add --name Rice --base-unit g --kcal 360` runs
- **THEN** `foods/rice.yaml` is created with `per: 100` and `nutrients` containing only `kcal: 360`

#### Scenario: Required nutrient missing
- **WHEN** `nomnom food add --name Rice --base-unit g --protein 7` runs and `kcal` is required
- **THEN** the command fails with an error naming `kcal` and no file is created

#### Scenario: Unknown nutrient flag
- **WHEN** `nomnom food add --name Rice --base-unit g --kcal 360 --protien 7` runs
- **THEN** the command fails with an error naming `--protien` and no file is created

#### Scenario: Negative nutrient value
- **WHEN** `nomnom food add --name Rice --base-unit g --kcal -5` runs
- **THEN** the command fails with an error and no file is created

#### Scenario: Unit name containing an equals sign
- **WHEN** a food is added with `--units 'a=b'=5`
- **THEN** the food has a unit named `a=b` equal to 5 base units

#### Scenario: Barcode with a leading zero
- **WHEN** a food is added with `--barcode 0123456789012`
- **THEN** the file stores the barcode as the string `"0123456789012"` and the slug ends with `-0123456789012`

#### Scenario: Non-numeric barcode
- **WHEN** a food is added with `--barcode abc`
- **THEN** the command fails with an error and no file is created

#### Scenario: Barcode used by another food
- **WHEN** the non-archived food `cola-034000470693` has the barcode `034000470693` and a food named `Coca Cola` is added with `--barcode 034000470693`
- **THEN** the command fails with an error naming the barcode and `cola-034000470693`, and no file is created

#### Scenario: Barcode used by another food in another form
- **WHEN** the non-archived food `cola-034000470693` has the barcode `034000470693` and a food named `Cola` is added with `--barcode 0034000470693`
- **THEN** the command fails with an error naming the barcode and `cola-034000470693`, and no file is created

#### Scenario: Same barcode twice in one command
- **WHEN** a food is added with `--barcode 034000470693 --barcode 0034000470693`
- **THEN** the command fails with an error naming both barcodes and no file is created

### Requirement: Barcode normalization
Barcodes SHALL be stored exactly as given, and SHALL be compared by their normalized form, following Open Food Facts: remove leading zeros; a result of 1 to 7 digits is left-padded with zeros to 8 digits; a result of 9 to 12 digits is left-padded with zeros to 13 digits; any other result is kept as it is. A barcode of zeros only normalizes to `00000000`. Two barcodes SHALL be the same barcode when their normalized forms are equal.

#### Scenario: UPC-A and its EAN-13 form
- **WHEN** the barcodes `034000470693` and `0034000470693` are compared
- **THEN** both normalize to `0034000470693` and are the same barcode

#### Scenario: EAN-8 is kept
- **WHEN** the barcode `96385074` is normalized
- **THEN** the result is `96385074`

#### Scenario: Short code is padded to 8 digits
- **WHEN** the barcode `00012345` or `12345` is normalized
- **THEN** the result is `00012345`

#### Scenario: Stored as given
- **WHEN** a food is added with `--barcode 034000470693`
- **THEN** its file stores `"034000470693"` and its slug ends with `-034000470693`

### Requirement: Barcode uniqueness
A barcode SHALL belong to at most one non-archived food. A food's barcodes are those of its latest version. Archived foods SHALL NOT hold barcodes: their barcodes don't conflict with other foods and are never matched by a lookup.

#### Scenario: Barcode of an archived food is free
- **WHEN** the latest version of `cola-034000470693` is archived and a food named `Coca Cola` is added with `--barcode 034000470693`
- **THEN** the food is added as `coca-cola-034000470693`

### Requirement: Invalid food files
A command that reads a food file SHALL fail when that file is invalid, with an error naming the file, and SHALL NOT write anything. A command that reads every food, such as `food list`, `food show --barcode` and `food add`, SHALL fail when any food file is invalid. In `foods/`, every file whose name ends with `.yaml` SHALL be a food file; a food file whose name without `.yaml` is not a valid slug SHALL be invalid. Other files and directories in `foods/` SHALL be ignored.

#### Scenario: One broken file fails the list
- **WHEN** `foods/apple.yaml` is valid, `foods/rice.yaml` contains invalid YAML, and `nomnom food list` runs
- **THEN** the command fails with an error naming `foods/rice.yaml` and prints no list

#### Scenario: Broken file blocks adding a food
- **WHEN** `foods/rice.yaml` contains invalid YAML and a food named `Apple` is added
- **THEN** the command fails with an error naming `foods/rice.yaml` and no file is created

#### Scenario: File that is not a slug
- **WHEN** `foods/` contains `My Apple.yaml` and `nomnom food list` runs
- **THEN** the command fails with an error naming `My Apple.yaml`

#### Scenario: Other files are ignored
- **WHEN** `foods/` contains `notes.txt` and a directory `old`
- **THEN** `nomnom food list` ignores both

### Requirement: food list command
`nomnom food list` SHALL print every non-archived food, one line each, sorted by slug in code point order. Each line SHALL be `<slug>@<latest version>`, the kind `food`, and the name of the latest version, in that order, as columns aligned across the output and separated by at least two spaces. The name SHALL come last and be printed in full. When there is no non-archived food, the command SHALL print `No foods` and exit with status 0.

#### Scenario: Foods listed
- **WHEN** foods `apple` (versions 1 and 2, named `Apple`) and `greek-yogurt-2-4601234567890` (version 1, named `Greek Yogurt 2%`) exist and `nomnom food list` runs
- **THEN** standard output is:
  ```
  apple@2                         food  Apple
  greek-yogurt-2-4601234567890@1  food  Greek Yogurt 2%
  ```

#### Scenario: Archived food is not listed
- **WHEN** the latest version of `rice` is archived and `nomnom food list` runs
- **THEN** `rice` is not in the output

#### Scenario: Recipes are not listed
- **WHEN** the recipe `pancakes` exists and `nomnom food list` runs
- **THEN** `pancakes` is not in the output

#### Scenario: No foods
- **WHEN** `foods/` is empty or missing and `nomnom food list` runs
- **THEN** standard output is `No foods` and the exit status is 0

### Requirement: food show command
`nomnom food show <slug>[@<version>]` SHALL print one version of a food: the given version, or the latest one when no version is given. It SHALL read only foods: a slug that isn't a food, including a recipe's slug, SHALL fail with an error saying there is no food with that slug. A version that doesn't exist SHALL fail with an error naming it. Archived foods SHALL be shown like any other. The output SHALL contain, in this order:
- a header line with the same columns as `food list`: `<slug>@<version>`, `food` and the name of the shown version
- `Created: <timestamp>` of the shown version
- `Latest version: <n>`, only when the shown version is not the latest
- `Archived: yes`, only when the food is archived
- `Barcodes: <barcode>, ...`, only when the shown version has barcodes, in stored order and as stored
- `Per <per> <base unit>:` followed by one line per nutrient in the current catalog, in catalog order, with its display name, its stored value exactly as stored, or `-` when the version doesn't give it, and its unit
- `Units:` followed by the base unit marked `base unit`, then each additional unit in stored order with its size in base units

#### Scenario: Latest version
- **WHEN** `apple@2` was created at `2026-10-02T08:00:00+03:00` with barcode `4601234567890`, `per: 100`, base unit `g`, nutrients `kcal: 52`, `protein: 0.3`, `carbs: 14`, `fiber: 2.4` and the unit `medium sized apple: 180`, the catalog is the default one, and `nomnom food show apple` runs
- **THEN** standard output is:
  ```
  apple@2  food  Apple
  Created: 2026-10-02T08:00:00+03:00
  Barcodes: 4601234567890
  Per 100 g:
    Energy          52 kcal
    Protein        0.3 g
    Fat              - g
    Carbohydrates   14 g
    Fiber          2.4 g
  Units:
    g                   base unit
    medium sized apple  180 g
  ```

#### Scenario: Older version
- **WHEN** `apple` has versions 1 and 2 and `nomnom food show apple@1` runs
- **THEN** the header starts with `apple@1`, the values are those of version 1, and the output contains `Latest version: 2`

#### Scenario: Archived food
- **WHEN** the latest version of `rice` is archived and `nomnom food show rice` runs
- **THEN** the food is shown and the output contains `Archived: yes`

#### Scenario: Slug of a recipe
- **WHEN** `pancakes` is a recipe and `nomnom food show pancakes` runs
- **THEN** the command fails with an error saying there is no food `pancakes`, the same as for a slug that doesn't exist, and the exit status is 1

#### Scenario: Version that does not exist
- **WHEN** `apple` has versions 1 and 2 and `nomnom food show apple@7` runs
- **THEN** the command fails with an error naming `apple@7`

### Requirement: Showing a food by barcode
`nomnom food show --barcode <digits>` SHALL show the latest version of the non-archived food that has a barcode equal to the given one after normalization, in the same format as `food show <slug>`. The digits SHALL be digits only. Exactly one of a slug and `--barcode` SHALL be given. When no non-archived food has the barcode, the command SHALL fail with an error naming the barcode as given and its normalized form. When several non-archived foods have it, which only hand edits can cause, the command SHALL fail with an error naming each of them as `<slug>@<latest version>`.

#### Scenario: Found by its EAN-13 form
- **WHEN** the food `cola-034000470693` has the barcode `034000470693` and `nomnom food show --barcode 0034000470693` runs
- **THEN** `cola-034000470693` is shown

#### Scenario: Found by a barcode that is not in the slug
- **WHEN** the food `cola-111` has barcodes `111` and `4601234567890`, and `nomnom food show --barcode 4601234567890` runs
- **THEN** `cola-111` is shown

#### Scenario: Only an archived food has the barcode
- **WHEN** the only food with barcode `4601234567890` is archived and `nomnom food show --barcode 4601234567890` runs
- **THEN** the command fails with the same error as for an unknown barcode

#### Scenario: Unknown barcode
- **WHEN** no food has a barcode normalizing to `0034000470693` and `nomnom food show --barcode 034000470693` runs
- **THEN** the command fails with an error naming `034000470693` and `0034000470693`, and the exit status is 1

#### Scenario: Several foods have the barcode
- **WHEN** hand-edited files give the non-archived foods `cola-1@1` and `cola-2@3` the barcode `4601234567890`, and `nomnom food show --barcode 4601234567890` runs
- **THEN** the command fails with an error naming `cola-1@1` and `cola-2@3`

#### Scenario: Slug and barcode together
- **WHEN** `nomnom food show apple --barcode 4601234567890` runs, or `nomnom food show` runs with neither
- **THEN** the command fails with an error explaining that exactly one of a slug and `--barcode` is needed

#### Scenario: Barcode with other characters
- **WHEN** `nomnom food show --barcode 46012abc` runs
- **THEN** the command fails with an error saying a barcode contains digits only

### Requirement: food update command
`nomnom food update <slug>` SHALL write a new version of the food with slug `<slug>`. It SHALL accept exactly the options of `food add`, with the same defaults and validation, and the values given SHALL form the complete new version: no field SHALL be carried over from the previous version. The command SHALL fail without writing anything when:
- `<slug>` is not a food (the error SHALL say when it is a recipe, and when it is neither)
- the food is archived
- any value is invalid, as for `food add`
- the slug derived from the new name and barcodes is unchanged and the new version is identical to the latest version: every field except `version` and `created` is equal, with nutrients and units compared regardless of order and barcodes compared in order

Barcodes SHALL be checked as for `food add`, except that the food being updated SHALL NOT count as holding its own barcodes, also when the update renames it, since the command archives the old food. Like `food add`, the command reads every food, so it SHALL fail when any food file is invalid.

When the derived slug equals `<slug>`, the command SHALL add the new version to `foods/<slug>.yaml` and print that path and the new version number. When the derived slug differs, the command SHALL create a new file for the new slug at version 1, then add an archiving version to the old food as `food archive` does, and print the path of the new file and the path and version of the archived one.

In both cases the command SHALL then print every field that differs from the latest version of the old food, with its previous and new value: the name, the base unit, `per`, each nutrient and each unit (added, removed or changed), and the barcodes that were added or removed. When the barcodes differ only in order, it SHALL say that their order changed.

#### Scenario: New version with a changed value
- **WHEN** `apple` has version 2 with `per: 100`, `kcal: 52` and `protein: 0.3`, and `nomnom food update apple --name Apple --base-unit g --kcal 55 --protein 0.3` runs
- **THEN** `foods/apple.yaml` gets version 3 with `kcal: 55`, and the output names the file, version 3, and `kcal` changing from 52 to 55, and no other field

#### Scenario: Omitted field is not carried over
- **WHEN** `apple@2` has `fiber: 2.4` and a unit `small sized apple`, and `apple` is updated without `--fiber` and without `--units`
- **THEN** version 3 has no `fiber` and no units, and the output reports `fiber` and the unit `small sized apple` as removed

#### Scenario: Default per applies
- **WHEN** `egg@1` has `per: 1` and `egg` is updated without `--per`
- **THEN** version 2 has `per: 100`, and the output reports `per` changing from 1 to 100

#### Scenario: Rename creates a new file
- **WHEN** `apple` has versions 1 and 2 and `nomnom food update apple --name 'Green Apple' --base-unit g --kcal 52` runs
- **THEN** `foods/green-apple.yaml` is created with version 1, `foods/apple.yaml` gets version 3 with the values of version 2 and `archived: true`, and the output names both files and reports `name` changing from `Apple` to `Green Apple`

#### Scenario: Rename keeps the barcode
- **WHEN** `milk-4600000000001` is named `Milk` with barcode `4600000000001`, and `nomnom food update milk-4600000000001 --name 'Whole Milk' --base-unit ml --kcal 64 --barcode 4600000000001` runs
- **THEN** `foods/whole-milk-4600000000001.yaml` is created with version 1 and `milk-4600000000001` is archived

#### Scenario: Barcode used by another food
- **WHEN** the non-archived food `cola-034000470693` has the barcode `034000470693`, and `milk-4600000000001` is updated with `--barcode 4600000000001 --barcode 0034000470693`
- **THEN** the command fails with an error naming the barcode and `cola-034000470693`, and no file is created or changed

#### Scenario: Existing references are unchanged
- **WHEN** a recipe and a day file pin `apple@2` and `apple` is updated or renamed
- **THEN** the recipe file and the day file are unchanged, and both still resolve `apple@2`

#### Scenario: Identical update
- **WHEN** `apple` is updated with values identical to its latest version
- **THEN** the command fails with an error saying nothing changed, and the file is unchanged

#### Scenario: Archived food
- **WHEN** the latest version of `apple` is archived and `apple` is updated
- **THEN** the command fails with an error saying `apple` is archived and must be unarchived first, and no file is created or changed

#### Scenario: Slug of a recipe
- **WHEN** `nomnom food update pancakes ...` runs and `pancakes` is a recipe
- **THEN** the command fails with an error saying `pancakes` is a recipe

#### Scenario: Unknown slug
- **WHEN** `nomnom food update unicorn ...` runs and `unicorn` is neither a food nor a recipe
- **THEN** the command fails with an error naming `unicorn`, and no file is created

### Requirement: food archive and unarchive commands
`nomnom food archive <slug>` SHALL add a new version to the food that copies every field of its latest version except `version` and `created`, with `archived: true`, and print the path of the file and the new version number. `nomnom food unarchive <slug>` SHALL do the same with `archived` omitted. Archiving an archived food, unarchiving a food that is not archived, and either command on a slug that is not a food SHALL fail without writing anything. Unarchiving a food SHALL also fail without writing anything when another non-archived food has a barcode of its latest version, compared after normalization, with an error naming the barcode and that food.

#### Scenario: Archive a food
- **WHEN** `apple` has versions 1 and 2 and `nomnom food archive apple` runs
- **THEN** `foods/apple.yaml` gets version 3 with the values of version 2 and `archived: true`, and new references to `apple` are rejected

#### Scenario: Unarchive a food
- **WHEN** the latest version of `apple` is version 3 and archived, and `nomnom food unarchive apple` runs
- **THEN** `foods/apple.yaml` gets version 4 with the values of version 3 and no `archived` field, and `apple` can be referenced again

#### Scenario: Already archived
- **WHEN** `apple` is archived and `nomnom food archive apple` runs
- **THEN** the command fails with an error saying `apple` is already archived, and the file is unchanged

#### Scenario: Not archived
- **WHEN** `apple` is not archived and `nomnom food unarchive apple` runs
- **THEN** the command fails with an error saying `apple` is not archived, and the file is unchanged

#### Scenario: Barcode taken while archived
- **WHEN** `cola-034000470693` is archived, the non-archived food `coca-cola-034000470693` has the barcode `034000470693`, and `nomnom food unarchive cola-034000470693` runs
- **THEN** the command fails with an error naming `034000470693` and `coca-cola-034000470693`, and the file is unchanged

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
