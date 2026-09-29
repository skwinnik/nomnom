## 1. Project setup

- [ ] 1.1 Add the `yaml` dependency, add the `bin` entry `nomnom -> src/cli.ts`, remove `index.ts`, and update the README setup section; verify `bun install` succeeds and `bun run check` passes
- [ ] 1.2 Create `src/cli.ts` with a `#!/usr/bin/env bun` shebang, subcommand dispatch (`food add`, `recipe add`, `log`, `validate log`), `NomnomError` printing to stderr and exit codes; verify `bun src/cli.ts nope` prints a usage error and exits with status 1
- [ ] 1.3 Add a test helper that creates a temporary data directory, runs core functions or the CLI with `NOMNOM_DIR` set, and fixes the clock; verify that a smoke test using it passes under `bun test`

## 2. Data directory and config

- [ ] 2.1 Implement data directory resolution (`NOMNOM_DIR`, falling back to `$HOME/.nomnom` when unset or empty) and path helpers for foods, recipes and day files (`logs/<yyyy>/<yyyy-mm-dd>.nom`); verify with unit tests for the set, unset and empty cases
- [ ] 2.2 Implement the default config, creating it when missing, and loading `config.yaml`; verify tests show that a missing config is created with the default nutrients and meals and that an existing config is never modified
- [ ] 2.3 Implement config validation (nutrient id pattern, unique ids, required flag, clash with reserved option names, meal id pattern, unique meals, malformed YAML) with errors naming `config.yaml`; verify with one test per rule

## 3. Shared primitives

- [ ] 3.1 Implement the slug rule (NFC normalisation, lowercasing, runs of characters other than Unicode letters and digits become `-`, trimmed, optional first-barcode suffix, empty slug rejected); verify tests cover `Greek Yogurt 2%`, barcodes, `Творог 5%` and `%%%`
- [ ] 3.2 Implement unit name normalisation and validation (trim, collapse whitespace, non-empty, no `#`) and the `name=amount` parser that splits at the last `=`; verify tests cover `'small sized apple'=134`, `'a=b'=5`, `#`, and invalid or non-positive amounts
- [ ] 3.3 Implement the number parser for CLI values (rejecting NaN, infinities and empty strings; positive or non-negative variants) and the reference parsers `slug[@v]` and `slug[@v]=amount [unit]`; verify with unit tests

## 4. Versioned storage and catalog

- [ ] 4.1 Implement reading versioned YAML files with `parseAllDocuments`, validating food and recipe documents (fields, version sequence, units, barcodes as strings) and reporting file and document number on error; verify tests read multi-version fixtures and reject malformed ones
- [ ] 4.2 Implement creating a new versioned file (leading `---`, exclusive `wx` create, quoted barcodes, only the nutrients given, optional fields omitted, local ISO timestamp with offset); verify a test that writes a food, reads it back and gets equal values, and a test showing that an existing file is never overwritten
- [ ] 4.3 Implement the catalog: resolve a slug across `foods/` and `recipes/`, get a specific or the latest version, report the archived state, check the shared namespace, and build the unit table of each version (implicit base unit, `serving` for recipes, additional units); verify tests cover collisions, missing versions, archived items and the unit tables of recipes with and without a yield

## 5. Nutrition

- [ ] 5.1 Implement the nutrient calculation for "amount in unit of slug@v" for foods and recipes, including recursive recipe totals, per-run caching, absent nutrients counting as 0, and only catalog nutrients being calculated; verify with a test reproducing the soup example (545.02 kcal total, about 136.3 per serving, about 54.5 per 100 g) and a nested-recipe test
- [ ] 5.2 Implement cycle detection that reports the chain of versions; verify a test with hand-written fixtures where `a@1` and `b@1` reference each other fails with both named

## 6. food add

- [ ] 6.1 Implement `nomnom food add` with `parseArgs` options built from the config (`--name`, `--base-unit`, `--per`, nutrient flags, repeatable `--units` and `--barcode`), validation (required nutrients, unknown flags, negative values, duplicate units, redefining the base unit, non-digit or duplicate barcodes) and output of the created path; verify with CLI tests for each scenario in the `foods` spec

## 7. recipe add

- [ ] 7.1 Implement `nomnom recipe add` (`--name`, repeatable `--ingredient`, `--servings` defaulting to 1, `--base-unit` and `--yield` together, `--units` requiring a yield, reserved `serving`), pinning the latest version when none is given, default units, rejecting archived items, and writing each ingredient with an explicit unit; verify with CLI tests for each scenario in the `recipes` spec
- [ ] 7.2 Print per-serving nutrients and, when a yield is given, nutrients per 100 base units, in catalog order rounded to one decimal place; verify a CLI test checks the printed output for the soup example

## 8. Daily log

- [ ] 8.1 Implement the line parser that keeps raw text and line numbers (blank, comment, trailing ` #` comments outside quotes, totals line, section, reference, inline, per-line syntax errors); verify with tests over the example day file and each malformed line type
- [ ] 8.2 Implement validation of a parsed day (entry before any section, unknown meal warning, merged duplicate sections, references resolved by slug, version and unit, inline nutrient keys, duplicates and required nutrients), collecting every error as `file:line: message`; verify with one test per rule and one with several errors
- [ ] 8.3 Implement day totals: sum over all entries using the nutrition module, format every catalog nutrient in catalog order rounded to one decimal without trailing zeros, and check the stored line (missing, stale by text comparison, malformed, misplaced, duplicated) with results as warnings; verify tests cover the "Totals of a day" example, a stale line after a hand edit, a nutrient newly added to the catalog, and a file without a totals line
- [ ] 8.4 Implement writes to raw lines: single-line entry insertion (after the last entry or comment of the meal's last section; a new section in configured order with blank-line separation; a new file with totals, a blank line, header and entry; a trailing newline), plus the totals upsert (drop every totals line, put one fresh line first, followed by a blank line when needed), with a write to a temporary file followed by a rename; verify tests show that every line other than totals lines stays identical byte for byte, and cover a misplaced totals line
- [ ] 8.5 Implement `nomnom log <meal> <ref> <amount> [unit...]` and `nomnom log <meal> --inline <description> --<nutrient> ...` with `--date` (default: today's local date), meal validation, latest-version pinning, rejection of archived items, refusal when the existing file has errors (totals warnings don't block), a refreshed totals line, and printing of the added line and the new totals; verify with CLI tests for each `log` scenario in the `daily-log` spec
- [ ] 8.6 Implement `nomnom validate log [--date D] [--fix]`: discover `logs/<yyyy>/<yyyy-mm-dd>.nom` files and warn about stray files, report errors and warnings per file, report "nothing logged" for a missing `--date` file, exit with status 1 only on errors, and with `--fix` rewrite the totals of files with no errors and print which files were fixed; verify with CLI tests for each `validate log` scenario in the `daily-log` spec

## 9. Wrap-up

- [ ] 9.1 Run an end-to-end check in a temporary `NOMNOM_DIR` (add foods, add a nested recipe, log reference and inline entries and check the totals line, hand-edit the day file, confirm that `validate log` reports stale totals and that `validate log --fix` repairs them, then log again), and document the commands and file formats in the README; verify `bun test` and `bun run check` both pass
