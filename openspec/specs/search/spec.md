# search Specification

## Purpose

Lets people and agents find the slug of a food or recipe from an approximate name, so they can pass it to `nomnom log`, `recipe add` or a `show` command.

## Requirements

### Requirement: search command
`nomnom search <text> ...` SHALL search the names of every non-archived food and recipe together. The positional words SHALL be joined with spaces to form the query. It SHALL print one line per match, with the same columns as `food list` and `recipe list`: `<slug>@<latest version>`, the kind (`food` or `recipe`) and the name of the latest version, aligned across the output and separated by at least two spaces, with the name last and in full. When nothing matches, it SHALL print `No foods or recipes match '<query>'` and exit with status 0. A query with no letters or digits SHALL fail with an error.

Search SHALL read every food and recipe file, and SHALL fail when any of them is invalid or when a slug is used by both a food and a recipe, naming the file or the slug.

#### Scenario: Foods and recipes together
- **WHEN** the food `greek-yogurt-2-4601234567890@1` (`Greek Yogurt 2%`) and the recipe `yogurt-bowl@2` (`Yogurt Bowl`) exist and `nomnom search yogurt` runs
- **THEN** standard output is:
  ```
  greek-yogurt-2-4601234567890@1  food    Greek Yogurt 2%
  yogurt-bowl@2                   recipe  Yogurt Bowl
  ```

#### Scenario: Query in several words
- **WHEN** `nomnom search greek yog` and `nomnom search 'greek yog'` run
- **THEN** both search for the query `greek yog`

#### Scenario: Archived items are not found
- **WHEN** the latest version of the food `rice` is archived and `nomnom search rice` runs
- **THEN** `rice` is not in the output

#### Scenario: Nothing matches
- **WHEN** no name matches and `nomnom search xyz` runs
- **THEN** standard output is `No foods or recipes match 'xyz'` and the exit status is 0

#### Scenario: Query without letters or digits
- **WHEN** `nomnom search '%%'` runs
- **THEN** the command fails with an error and the exit status is 1

#### Scenario: Broken file
- **WHEN** `recipes/stew.yaml` contains invalid YAML and `nomnom search soup` runs
- **THEN** the command fails with an error naming `recipes/stew.yaml`

### Requirement: Fuzzy matching
The query and each name SHALL be split into words the same way slugs are built: lowercased, with every run of characters that are not Unicode letters or digits acting as a separator. A name SHALL match when every query word matches at least one word of the name, in any order. A query word SHALL match a name word when it is within its edit budget of the name word or of any prefix of it, where an edit is inserting, deleting or replacing one character, or swapping two adjacent characters. The edit budget SHALL depend on the length of the query word in characters: 0 edits for 1 to 3 characters, 1 edit for 4 to 7, and 2 edits for 8 or more. Only names SHALL be searched, not slugs or barcodes.

#### Scenario: Word prefix
- **WHEN** a food is named `Greek Yogurt 2%` and `nomnom search yog` runs
- **THEN** the food is found

#### Scenario: Any word order
- **WHEN** a food is named `Greek Yogurt 2%` and `nomnom search yog greek` runs
- **THEN** the food is found

#### Scenario: Typo
- **WHEN** a food is named `Greek Yogurt 2%` and `nomnom search yogrt` runs
- **THEN** the food is found

#### Scenario: Typos in several words
- **WHEN** a recipe is named `Chicken Soup` and `nomnom search chiken soop` runs
- **THEN** the recipe is found

#### Scenario: Short words need an exact prefix
- **WHEN** a food is named `Apple` and `nomnom search ab` runs
- **THEN** the food is not found

#### Scenario: Every query word must match
- **WHEN** a food is named `Greek Yogurt 2%` and `nomnom search greek pancake` runs
- **THEN** the food is not found

#### Scenario: Non-Latin names
- **WHEN** a food is named `Творог 5%` and `nomnom search творог` runs
- **THEN** the food is found

#### Scenario: Barcodes are not searched
- **WHEN** the food `greek-yogurt-2-4601234567890` is named `Greek Yogurt 2%` and `nomnom search 4601234567890` runs
- **THEN** the food is not found

### Requirement: Ranking
Search results SHALL be ordered by the number of edits the match needs, fewest first: for each query word, the fewest edits with which it matches a word of the name, summed over the query words. Results with the same number of edits SHALL be ordered by slug in code point order.

#### Scenario: Closer match first
- **WHEN** foods `apple` (`Apple`) and `ample-bars` (`Ample Bars`) exist and `nomnom search apple` runs
- **THEN** `apple` is listed before `ample-bars`

#### Scenario: Ties by slug
- **WHEN** foods `rice` (`Rice`) and `brown-rice` (`Brown Rice`) exist and `nomnom search rice` runs
- **THEN** `brown-rice` is listed before `rice`
