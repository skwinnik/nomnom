## MODIFIED Requirements

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

## ADDED Requirements

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
