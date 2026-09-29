## MODIFIED Requirements

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
