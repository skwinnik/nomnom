## 1. Shared primitives

- [ ] 1.1 Add `shared/barcodes.ts` with `parseBarcode` (trimmed, digits only) and `normaliseBarcode` (Open Food Facts rule), and move barcode parsing out of `food-service.ts`; verify unit tests cover `034000470693` and `0034000470693` -> `0034000470693`, `96385074` kept, `12345` and `00012345` -> `00012345`, zeros only -> `00000000`, 14 and 15 digits kept, and non-digits rejected
- [ ] 1.2 Add `slugWords(text)` to `shared/slug.ts` and rebuild `slugify` on it; verify the existing slug tests still pass and new tests split `Greek Yogurt 2%`, `Творог 5%` and `%%` into the expected words

## 2. Listing the store and catalog

- [ ] 2.1 Add `foodSlugs()` and `recipeSlugs()` to `VersionedStore` and its fake store: `*.yaml` files only, sorted by code point, other files and directories ignored, a name that isn't a slug rejected with a problem naming the file; verify store tests with the in-memory file system cover a missing directory, `notes.txt`, a subdirectory and `My Apple.yaml`
- [ ] 2.2 Add `Catalog.all()`, which unions both slug lists and loads every item through `find`; verify catalog tests return foods and recipes together, and fail on a broken file and on a slug that is both a food and a recipe

## 3. Foods

- [ ] 3.1 Implement `FoodService.list()`: non-archived foods from `foodSlugs()` with slug, latest version, kind and name, sorted by slug; verify service tests cover archived foods left out, recipes never read, and a broken food file failing the list
- [ ] 3.2 Implement `FoodService.show({ ref?, barcode? })` by slug: read only `foods/`, the given or latest version, `latestVersion`, the item's `archived` state, and every catalog nutrient with its stored value or `undefined`; verify tests cover the latest version, `apple@1`, `apple@7`, an archived food, and a recipe slug giving the not-found error
- [ ] 3.3 Add `foodsWithBarcode(normalized)` in the food service and use it for `show({ barcode })`: exactly one of ref and barcode, one match shown, none -> error naming the digits and their normalized form, several -> error naming each `slug@version`, archived foods never matched; verify a test for each scenario in the spec's barcode requirement
- [ ] 3.4 Make `FoodService.add` reject barcodes that are the same after normalization within one call, and barcodes a non-archived food already has; verify tests cover each new `food add` scenario, a freed barcode of an archived food being accepted, and a broken food file failing `add` without writing

## 4. Recipes

- [ ] 4.1 Implement `RecipeService.list()` from `recipeSlugs()`, as for foods; verify service tests cover archived recipes left out, foods never read, and a broken recipe file failing the list
- [ ] 4.2 Implement `RecipeService.show(ref)`: read only `recipes/`, the given or latest version, `latestVersion`, `archived`, allowed units with sizes in base units, and `perServing`/`perHundred` through `Nutrition.amountOf`, with the same nutrient helper `add` uses; verify tests cover the soup example (about 136.3 kcal per serving, about 54.5 per 100 g), a recipe without a yield, an older version, a food slug giving the not-found error, and a cycle failing

## 5. Search

- [ ] 5.1 Implement `search/match.ts`: the cost of a query word against a name word (optimal string alignment distance to the best prefix, over code points), the edit budget by query word length, and a name's total cost or no match; verify unit tests cover `yog`, `yogrt`, `yog greek`, `chiken soop`, `ab` not matching `Apple`, `greek pancake` not matching, `творог`, and swapped letters counting as one edit
- [ ] 5.2 Implement `SearchService.search(text)` over `Catalog.all()`: non-archived only, names of latest versions, ranked by cost and then slug, rejecting a query with no words; wire it into `createServices` and export its types from `src/index.ts`; verify service tests cover both ranking scenarios, archived items left out, barcodes not searched, and a broken file failing

## 6. CLI

- [ ] 6.1 Add `commands/format.ts` with `formatItems` (aligned `slug@version`, kind and name columns) and `formatNutrients` moved from `recipe-add.ts`, plus the variant for stored values (`String(value)` or `-`); verify unit tests for column alignment with `food` and `recipe` rows, and that the `recipe add` tests still pass unchanged
- [ ] 6.2 Add `food list` and `recipe list`, printing `No foods` or `No recipes` when empty; extend the CLI service mocks; verify CLI tests with mocked services check the exact output of the list scenarios in the specs
- [ ] 6.3 Add `food show [food] [--barcode <digits>]` and `recipe show <recipe>` printing the sections in the order the specs give; verify CLI tests with mocked services check the exact `apple@2` and `chicken-soup@1` output, the `Latest version:` and `Archived: yes` lines, and a recipe without a yield
- [ ] 6.4 Add `search <text...>` joining its words into one query, printing `No foods or recipes match '<query>'` when empty; register all new commands in `commands/index.ts`; verify CLI tests check the output of the mixed food and recipe scenario, that `search greek yog` passes `greek yog`, and that `nomnom food --help` lists `add`, `list` and `show`

## 7. End to end and docs

- [ ] 7.1 Add end-to-end tests in a sandbox: add foods and a recipe, then `food list`, `recipe list`, `food show`, `food show --barcode` with the EAN-13 form of a UPC-A code, `recipe show` and `search` with a typo; plus `food add` rejected for a conflicting barcode, and a broken food file failing `food list`; verify they pass with `bun test`
- [ ] 7.2 Document `food list`, `food show` (including `--barcode` and how barcodes are compared), `recipe list`, `recipe show` and `search` in the README; verify the examples match the output of the commands
- [ ] 7.3 Run `bun test`, `bun run typecheck` and `bun run check`, and verify all three pass
