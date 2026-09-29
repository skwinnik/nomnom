# data-directory Specification

## Purpose

Defines where nomnom keeps its plain-text data, how that directory is laid out, and the `config.yaml` file that declares the nutrient catalog and the meals used by every other capability.

## Requirements

### Requirement: Data directory resolution
The system SHALL use the directory given by the `NOMNOM_DIR` environment variable as its data directory. When `NOMNOM_DIR` is unset or empty, the system SHALL use `$HOME/.nomnom`.

#### Scenario: NOMNOM_DIR is set
- **WHEN** `NOMNOM_DIR` is `/tmp/nn` and any command runs
- **THEN** the system reads and writes data only under `/tmp/nn`

#### Scenario: NOMNOM_DIR is unset
- **WHEN** `NOMNOM_DIR` is unset and `HOME` is `/home/user`
- **THEN** the system uses `/home/user/.nomnom` as the data directory

#### Scenario: NOMNOM_DIR is empty
- **WHEN** `NOMNOM_DIR` is set to an empty string
- **THEN** the system uses `$HOME/.nomnom` as the data directory

### Requirement: Directory layout
The data directory SHALL contain `config.yaml` and the folders `foods/`, `recipes/` and `logs/`. The system SHALL create the data directory and any missing folder when a command needs to write into it.

#### Scenario: First write into an empty location
- **WHEN** the data directory does not exist and a food is added
- **THEN** the system creates the data directory, `config.yaml` and `foods/`, and writes the food file into `foods/`

### Requirement: Default configuration
When `config.yaml` does not exist, the system SHALL run the command with a default configuration and SHALL create `config.yaml` with that configuration when the command succeeds, together with the files the command writes. A command that fails, `--help`, and a dry run SHALL NOT create it. The default nutrient catalog SHALL contain `kcal` (required, unit `kcal`), `protein`, `fat`, `carbs` and `fiber` (unit `g`). The default meals SHALL be `breakfast`, `lunch`, `dinner` and `snack`, in that order.

#### Scenario: Missing config is created
- **WHEN** a command runs successfully and `config.yaml` does not exist
- **THEN** `config.yaml` is created with the default nutrients and meals, and the command used that configuration

#### Scenario: Missing config and a failed command
- **WHEN** `config.yaml` does not exist and a command fails, for example `food add` with an invalid value
- **THEN** `config.yaml` is not created

#### Scenario: Dry run on a fresh data directory
- **WHEN** the data directory does not exist and `nomnom food add --name Apple --base-unit g --kcal 52 --dry-run` runs
- **THEN** the preview lists `config.yaml` as a new file with the default configuration and `foods/apple.yaml` as a new file, and the data directory still does not exist afterwards

#### Scenario: Existing config is left alone
- **WHEN** a command runs and `config.yaml` exists
- **THEN** the system does not modify `config.yaml`

### Requirement: Nutrient catalog
`config.yaml` SHALL define a `nutrients` list. Each entry SHALL have an `id`, a display `name` and a `unit`, and MAY have `required: true`. A nutrient id SHALL start with a lowercase letter and contain only lowercase letters, digits and underscores. Ids SHALL be unique and SHALL NOT clash with the name of a built-in command option. The list order SHALL be the order in which nutrients are written and displayed.

#### Scenario: Custom nutrient
- **WHEN** `config.yaml` lists a nutrient with id `vitamin_c` and unit `mg`
- **THEN** commands that accept nutrient values accept `--vitamin_c`

#### Scenario: Invalid nutrient id
- **WHEN** `config.yaml` lists a nutrient with id `Vitamin C`
- **THEN** every command fails with an error naming `config.yaml` and the invalid id

#### Scenario: Nutrient id clashes with a built-in option
- **WHEN** `config.yaml` lists a nutrient with id `name`
- **THEN** every command fails with an error explaining that `name` is reserved

### Requirement: Missing nutrient values count as zero
In food records and inline log entries, a nutrient that is absent SHALL count as 0 in every calculation, unless it is required, and the system SHALL NOT write zero values for nutrients that were not given. A food version that stores a value under an id that is not in the catalog, or lacks a required nutrient, SHALL be unusable (see the foods capability), and an inline entry that does either SHALL be invalid (see the daily-log capability). Calculated output, such as the nutrients printed by `recipe add`, is not a record and SHALL list every catalog nutrient, zeros included.

#### Scenario: Nutrient added to the catalog later
- **WHEN** `fiber` is added to the catalog, not required, after a food was saved without fiber
- **THEN** that food counts as 0 fiber and its file is not rewritten

#### Scenario: Nutrient removed from the catalog later
- **WHEN** `sodium` is removed from the catalog after a food version was saved with `sodium: 5`
- **THEN** that version is unusable until `sodium` is removed from it by hand, and its file is not rewritten

#### Scenario: Zero in calculated output
- **WHEN** a recipe's ingredients contain no fiber and `recipe add` prints its nutrients
- **THEN** the printed nutrients include fiber with a value of 0

### Requirement: Meals
`config.yaml` SHALL define a `meals` list of meal ids. A meal id SHALL contain only lowercase letters, digits, `-` and `_`. Ids SHALL be unique. The list order SHALL be the order of meals in log files and displays.

#### Scenario: Custom meals
- **WHEN** `config.yaml` sets meals to `breakfast`, `second-breakfast`, `lunch`
- **THEN** `second-breakfast` is accepted wherever a meal is expected

### Requirement: Invalid configuration
When `config.yaml` cannot be parsed or violates the rules above, every command SHALL fail with an error that names `config.yaml` and describes the problem, and SHALL NOT modify any data.

#### Scenario: Malformed YAML
- **WHEN** `config.yaml` contains invalid YAML
- **THEN** the command exits with a non-zero status and an error naming `config.yaml`
