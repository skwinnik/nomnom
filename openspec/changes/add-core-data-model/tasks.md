## 1. Project setup

- [ ] 1.1 Add the `yaml` dependency to `@nomnom/core`; verify `bun install` succeeds and `bun run typecheck` and `bun run check` pass
- [ ] 1.2 Turn the spawn helper in `apps/cli/src/index.test.ts` into a shared end-to-end helper that runs the CLI with `NOMNOM_DIR` set to a fresh temporary directory, removed afterwards; verify the existing end-to-end tests pass using it

## 2. Data directory and config

- [ ] 2.1 Add `dataDir` to `ServiceDependencies`, resolve it in `apps/cli/src/index.ts` from `NOMNOM_DIR` (falling back to `$HOME/.nomnom` when unset or empty), and add core path helpers for `config.yaml`, foods, recipes and day files (`logs/<yyyy>/<yyyy-mm-dd>.nom`); verify with core unit tests for the paths and end-to-end tests for the set, unset and empty cases
- [ ] 2.2 Implement `ConfigService`: the default config, creating it when missing, loading `config.yaml` and caching it for the run; add the config to `CommandContext` through `resolveContext`; verify with the in-memory file system that a missing config is created with the default nutrients and meals and that an existing config is never modified
- [ ] 2.3 Implement config validation (nutrient id pattern, unique ids, required flag, clash with reserved option names, meal id pattern, unique meals, malformed YAML) with errors naming `config.yaml`; verify with one test per rule

## 3. Shared primitives

- [ ] 3.1 Implement the slug rule (NFC normalisation, lowercasing, runs of characters other than Unicode letters and digits become `-`, trimmed, optional first-barcode suffix, empty slug rejected); verify tests cover `Greek Yogurt 2%`, barcodes, `Творог 5%` and `%%%`
- [ ] 3.2 Implement unit name normalisation and validation (trim, collapse whitespace, non-empty, no `#`) and the `name=amount` parser that splits at the last `=`; verify tests cover `'small sized apple'=134`, `'a=b'=5`, `#`, and invalid or non-positive amounts
- [ ] 3.3 Implement the number parser for CLI values (rejecting NaN, infinities and empty strings; positive or non-negative variants) and the reference parsers `slug[@v]` and `slug[@v]=amount [unit]`; verify with unit tests

## 4. Versioned storage and catalog

- [ ] 4.1 Implement reading versioned YAML files with `parseAllDocuments`, validating food and recipe documents (fields, version sequence, units, barcodes as strings) and reporting file and document number on error; verify tests read multi-version fixtures and reject malformed ones
- [ ] 4.2 Implement creating a new versioned file through `FileSystem.createExclusive` (leading `---`, quoted barcodes, only the nutrients given, optional fields omitted, local ISO timestamp with offset from the `Clock`); verify a test that writes a food, reads it back and gets equal values, and a test showing that an existing file is never overwritten
- [ ] 4.3 Implement the catalog: resolve a slug across `foods/` and `recipes/`, get a specific or the latest version, report the archived state, check the shared namespace, and build the unit table of each version (implicit base unit, `serving` for recipes, additional units); verify tests cover collisions, missing versions, archived items and the unit tables of recipes with and without a yield

## 5. Nutrition

- [ ] 5.1 Implement the nutrient calculation for "amount in unit of slug@v" for foods and recipes, including recursive recipe totals, per-run caching, absent nutrients counting as 0, and only catalog nutrients being calculated; verify with a test reproducing the soup example (545.02 kcal total, about 136.3 per serving, about 54.5 per 100 g) and a nested-recipe test
- [ ] 5.2 Implement cycle detection that reports the chain of versions; verify a test with hand-written fixtures where `a@1` and `b@1` reference each other fails with both named

## 6. food add

- [ ] 6.1 Implement `FoodService.add` with validation (required nutrients, negative values, duplicate units, redefining the base unit, non-digit or duplicate barcodes), and the `food add` command with options built from `CommandContext` (`--name`, `--base-unit`, `--per`, nutrient flags, repeatable `--units` and `--barcode`) that prints the created path; verify with core service tests and CLI tests with a mocked service for each scenario in the `foods` spec, including an unknown nutrient flag

## 7. recipe add

- [ ] 7.1 Implement `RecipeService.add` and the `recipe add` command (`--name`, repeatable `--ingredient`, `--servings` defaulting to 1, `--base-unit` and `--yield` together, `--units` requiring a yield, reserved `serving`), pinning the latest version when none is given, default units, rejecting archived items, and writing each ingredient with an explicit unit; verify with core service tests and CLI tests with a mocked service for each scenario in the `recipes` spec
- [ ] 7.2 Print per-serving nutrients and, when a yield is given, nutrients per 100 base units, listing every catalog nutrient in catalog order (zeros included) rounded to one decimal place; verify a CLI test checks the printed output for the soup example

## 8. Daily log

- [ ] 8.1 Implement the line parser that keeps raw text and line numbers (blank, comment, trailing ` #` comments outside quotes, section, reference, inline, per-line syntax errors); verify with tests over the example day file and each malformed line type
- [ ] 8.2 Implement validation of a parsed day (entry before any section, unknown meal warning, merged duplicate sections, references resolved by slug, version and unit, inline nutrient keys, duplicates and required nutrients), collecting every error as a located problem; verify with one test per rule and one with several errors
- [ ] 8.3 Implement single-line entry insertion into the raw lines (after the last entry or comment of the meal's last section; a new section in configured order with blank-line separation; a new file with the header and entry; a trailing newline), written through `FileSystem.replaceAtomic`; verify tests show that every existing line stays identical byte for byte
- [ ] 8.4 Implement `DayLogService.log` and the `log` command: `nomnom log <meal> <ref> <amount> [unit...]` and `nomnom log <meal> --inline <description> --<nutrient> ...` with `--date` (default: today's local date from the `Clock`), meal validation, latest-version pinning, rejection of archived items, refusal when the existing file has errors, printing of warnings about the existing file without blocking, and printing of the added line; verify with core service tests and CLI tests for each `log` scenario in the `daily-log` spec

## 9. Wrap-up

- [ ] 9.1 Run an end-to-end check in a temporary `NOMNOM_DIR` (add foods, add a nested recipe, log reference and inline entries, hand-edit the day file to add a comment and an entry and confirm that the next `log` keeps them unchanged, introduce an invalid line and confirm that `log` refuses with its line number, fix it, then log again), and document the commands and file formats in the README; verify `bun test`, `bun run typecheck` and `bun run check` all pass
