## 1. Versioned storage

- [ ] 1.1 Add `appendFood` and `appendRecipe` to `VersionedStore` (and its mock): read and parse the file, number the new document `latest + 1`, stamp `created` from the `Clock`, add a newline when the text doesn't end with one, and write the old text plus the new document with `replaceAtomic`; verify tests that the earlier text is an exact prefix of the result, that a file without a final newline reads back with every version, that a missing file and an invalid file are reported without writing, and that the version number comes from the file, not the caller

## 2. Comparing versions

- [ ] 2.1 Implement `diffFood` and `diffRecipe` as a pure module returning changes as data (scalar changes with absent values, map entries by key regardless of order, list items added and removed, order-only list changes), ignoring `version`, `created` and `archived`, with numbers as text via `String(number)`; verify unit tests cover each change kind, nutrients no longer in the catalog, a recipe losing its yield, ingredients shown as `slug@version amount unit`, and an empty result for identical versions

## 3. Foods

- [ ] 3.1 Move `FoodService.add`'s input handling (name, base unit, `per`, nutrients, units, barcodes and their conflict check, slug) into one function used by `add`, and give `foodsWithBarcode` an optional slug to leave out; verify the existing `food add` tests, including its barcode conflict tests, pass unchanged
- [ ] 3.2 Implement `FoodService.update(slug, input)`: reject a slug that is a recipe or unknown and an archived food, handle the input as `add` does, append when the slug is unchanged (rejecting an empty diff), otherwise check the new slug is free, create the new file, then archive the old food; return the paths, versions and changes; verify core tests for every `food update` scenario in the `foods` spec, including a rename onto an archived slug, an archiving write that fails after the new file was created, an update keeping the food's barcode, a rename keeping the barcode, and a barcode held by another food
- [ ] 3.3 Implement `FoodService.archive(slug)` and `unarchive(slug)` by appending the latest version's fields with the flag changed; verify core tests for archiving, unarchiving, already archived, not archived, a slug that is a recipe, and unarchiving a food whose barcode another active food took while it was archived, and that a new reference is rejected after archiving and accepted after unarchiving

## 4. Recipes

- [ ] 4.1 Move `RecipeService.add`'s input handling (servings, yield, units, pinning ingredients as new references, calculating nutrients) into one function used by `add`; verify the existing `recipe add` tests pass unchanged
- [ ] 4.2 Implement `RecipeService.update(slug, input)` with the same flow as foods, plus rejecting an ingredient that references the recipe being updated; return the paths, versions, changes and nutrients; verify core tests for every `recipe update` scenario in the `recipes` spec, including re-pinning to a newer ingredient version, an explicit older version, an archived ingredient and a dropped yield
- [ ] 4.3 Implement `RecipeService.archive(slug)` and `unarchive(slug)`, copying ingredient pins without resolving them as new references; verify core tests for each `recipe archive and unarchive` scenario, including unarchiving a recipe whose ingredient is archived

## 5. CLI

- [ ] 5.1 Extract the option definitions of `food add` and `recipe add` so `food update` and `recipe update` reuse them with a required `<slug>` positional, and add a shared formatter for changes (`field: before -> after`, `(none)` for absent, added and removed list items, order changes); verify `food update --help` and `recipe update --help` list the same options as their `add` commands, and formatter tests
- [ ] 5.2 Add the `food update` and `recipe update` commands printing `Updated <path> (version N)` or `Created <path>` and `Archived <path> (version N)` for a rename, then the changes, and for recipes the nutrient tables; verify CLI tests with mocked services for both outcomes
- [ ] 5.3 Add `food archive`, `food unarchive`, `recipe archive` and `recipe unarchive`, each taking a `<slug>` positional and printing `Archived <path> (version N)` or `Unarchived <path> (version N)`; register all six commands in `commands/index.ts`; verify CLI tests with mocked services and that `nomnom food --help` and `nomnom recipe --help` list the new subcommands

## 6. End to end

- [ ] 6.1 Add end-to-end tests in a sandbox: add a food, pin it in a recipe and a day file, update it, rename it and archive it, then check the earlier documents are byte for byte unchanged, the recipe and day file are untouched and still resolve, the renamed food is archived, and `log` rejects the archived slug; also rename a food with a barcode and check `food show --barcode` finds the new slug; then run `bun test`, `bun run typecheck` and `bun run check` and verify all pass
