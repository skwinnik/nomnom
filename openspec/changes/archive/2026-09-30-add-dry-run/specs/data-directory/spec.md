## MODIFIED Requirements

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
