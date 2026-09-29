## Purpose

Defines food records: immutable, versioned entries with typed-in nutrient values per amount of a base unit and named units that convert to it, stored one file per food, and the `nomnom food add` command that creates them.

## ADDED Requirements

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
The system SHALL NOT modify or remove an existing version document. New versions SHALL only be added as new documents after the existing ones.

#### Scenario: Existing versions are preserved byte for byte
- **WHEN** any nomnom command runs against a food file
- **THEN** the bytes of every existing version document in that file are unchanged

### Requirement: Slugs and filenames
The slug of a food SHALL be derived from its name when the food is created: lowercase the name, replace every run of characters that are not Unicode letters or digits with `-`, and remove leading and trailing `-`. When the food has at least one barcode, `-` followed by the first barcode SHALL be appended. A name that yields an empty slug SHALL be rejected.

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

### Requirement: Shared namespace
Food and recipe slugs SHALL share one namespace. Creating a food or a recipe SHALL fail when a file with the same slug exists in either `foods/` or `recipes/`, including archived ones.

#### Scenario: Food already exists
- **WHEN** `foods/apple.yaml` exists and a food named `Apple` is added
- **THEN** the command fails with an error saying `apple` already exists, and the existing file is unchanged

#### Scenario: Recipe with the same slug exists
- **WHEN** `recipes/pancakes.yaml` exists and a food named `Pancakes` is added
- **THEN** the command fails with an error saying `pancakes` is already used by a recipe

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
- `--barcode <digits>` (repeatable; digits only; stored as strings, keeping leading zeros; duplicates rejected)

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
