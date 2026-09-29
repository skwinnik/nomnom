## Context

Core can read one food or recipe by slug (`VersionedStore.readFood`/`readRecipe`) and resolve a slug across the shared namespace (`Catalog.find`/`resolve`, which fails when a slug is both a food and a recipe). Nothing reads a whole directory: `FileSystem.list` exists and is covered by the contract tests, but no code calls it. `food add` checks that barcodes are digits and not repeated as strings, and the only uniqueness check is on the slug. `recipe add` already formats nutrients per serving and per 100 base units with `formatNutrients` in `apps/cli/src/commands/recipe-add.ts`, and `Nutrition.amountOf` calculates any amount of a saved version. See `proposal.md` for motivation and the specs for the behavior contract.

## Goals / Non-Goals

**Goals:**
- Read commands that stay thin: core returns display-ready values (catalog nutrients with names and units, units with sizes), and the CLI only lays them out.
- One place for each rule: barcode normalization, reading every file of a kind, fuzzy matching.
- No port changes and no new dependencies.

**Non-Goals:**
- An index or cache of the catalog on disk. Every command that needs every file reads them all.
- Sharing the item-line layout with `log` output or error messages.

## Decisions

### Module layout

```
packages/core/src/
  shared/barcodes.ts     parseBarcode (digits only) and normaliseBarcode (Open Food Facts rule)
  shared/slug.ts         + slugWords(text): the words of the slug rule, without throwing
  store/versioned-store  + foodSlugs() / recipeSlugs(): slugs of every *.yaml in foods/ or recipes/
  catalog/catalog.ts     + all(): every food and recipe, through the find() cache
  foods/food-service     + list(), show({ ref?, barcode? }); add() checks barcode conflicts
  recipes/recipe-service + list(), show(ref)
  search/match.ts        pure fuzzy matching: word cost with an edit budget
  search/search-service  SearchService.search(text)
apps/cli/src/commands/
  format.ts              formatItems (aligned item lines), formatNutrients (moved from recipe-add.ts)
  food-list.ts, food-show.ts, recipe-list.ts, recipe-show.ts, search.ts
```

`Services` gains `search: SearchService`, wired in `createServices` with the catalog.

### Listing files: slugs from the store, records per kind

`foodSlugs()` and `recipeSlugs()` call `fs.list` on `foods/` or `recipes/`, keep files whose name ends with `.yaml`, and strip the suffix. A name that isn't a valid slug (`isSlug`) throws `NomnomError` with a problem naming the file. Directories and other files are skipped. `fs.list` already sorts by code point, so the slugs come out in the order the lists need.

`food list`, `food show --barcode` and the barcode check in `food add` read foods only: slugs from `foodSlugs()`, then `readFood` for each. `recipe list` reads recipes only. So a broken recipe file never fails a food command, which matches the specs ("a command that reads every food"). `search` needs both kinds and uses `Catalog.all()`, which unions both slug lists and loads each through `find`. That keeps the existing "slug is both a food and a recipe" error and fills the per-run cache.

Alternative considered: `Catalog.all()` for everything, filtered by kind. Rejected because `food list` would then fail on a broken recipe file.

Every read goes through the existing parsers, which throw `NomnomError` with the file and line, so "broken files fail everything" needs no new error path.

### Show reads its own kind directly

`food show <ref>` parses the ref with `parseItemRef` and calls `store.readFood(slug)`, not `Catalog.resolve`. A recipe slug then simply isn't found, with no special case, as decided. The version is checked against the versions read, with the same wording as `Catalog.resolve` for a missing version.

`FoodService.show` takes `{ ref?: string; barcode?: string }` and throws `NomnomError` unless exactly one is given, so the command stays a pass-through. It returns:

```ts
interface FoodShown {
  slug: string;
  food: FoodVersion;          // the shown version
  latestVersion: number;
  archived: boolean;          // of the item, i.e. its latest version
  nutrients: StoredNutrient[]; // every catalog nutrient: id, name, unit, value | undefined
}
```

`RecipeService.show(ref)` returns the recipe version, `latestVersion`, `archived`, its allowed units from `measureOf` (sizes converted to base units for display), and `perServing`/`perHundred` computed with `Nutrition.amountOf(item, 1, "serving")` and `amountOf(item, 100, baseUnit)`, then turned into `NutrientAmount[]` by the same helper `recipe add` uses. Calculation errors propagate unchanged.

### Barcodes: normalize for comparison, store as given

`normaliseBarcode` implements the rule in the foods spec and nothing else: no warning for unusual lengths, no check digit, no UPC-E expansion. `parseBarcode` moves out of `food-service.ts` so `food show --barcode` rejects non-digits with the same message.

A food's barcodes are those of its latest version, and archived foods have none. One helper in the food service, `foodsWithBarcode(normalized)`, scans every food and returns the non-archived ones whose latest version has that barcode after normalization. `food add` calls it for each new barcode and fails on the first hit, naming the barcode and the slug. `food show --barcode` calls it once: zero hits is the not-found error, which names the digits as given and their normalized form; one hit is shown; several fail, naming each `slug@version`. Duplicates within one `food add` are checked by normalized form before any file is read.

Alternative considered: normalizing barcodes when writing. Rejected: the stored digits would differ from the ones printed on the package, and the first barcode is part of the slug.

### Fuzzy matching

`slugWords(text)` applies the slug rule (NFC, lowercase, split on runs of non-letters and non-digits) and returns the words. `slugify` is rewritten on top of it, so names and queries are split by exactly the same rule as slugs.

For a query word `q` and a name word `w`, the cost is the smallest optimal-string-alignment distance between `q` and any prefix of `w` (insert, delete, replace, swap adjacent). It is computed with the standard dynamic-programming table over the code points of `q` and `w`, taking the minimum of the last row, since the rest of `w` is free. The cost is accepted when it is within the budget for the length of `q` (0 for 1–3, 1 for 4–7, 2 for 8 or more). A name's cost is the sum, over query words, of the cheapest accepted name word. The name matches only if every query word has one. `search` filters non-archived items, scores the latest version's name, and sorts by cost, then by slug.

Alternatives considered: a library (Fuse.js, uFuzzy), which would mean a threshold that can't be written down as spec scenarios and a new dependency; subsequence matching (fzf style), which adds noise for short food names; accent folding and transliteration, which were left out on purpose.

### Output layout in the CLI

`formatItems(items)` prints `slug@version`, kind and name, padding the first two columns to the widest value in the output plus two spaces. The name goes last, unpadded. `food list`, `recipe list`, `search` and the header line of both `show` commands use it. `formatNutrients` moves to `format.ts` unchanged and gains a variant for stored food values that prints the value as `String(value)`, or `-` when absent, instead of rounding. Section titles and indentation follow `recipe add` (`Title:` and two-space indented rows).

Empty results print `No foods`, `No recipes` or `No foods or recipes match '<query>'` on standard output with exit status 0. Errors take the usual `NomnomError` path.

## Risks / Trade-offs

- [Every `food add`, `food list`, `food show --barcode` and `search` parses every relevant file] → A personal catalog has hundreds to a few thousand small files, which takes milliseconds to low hundreds of milliseconds with Bun. An on-disk index would be derived data that hand edits can make stale. It can be added later without changing behavior.
- [One broken file blocks `food add`, lists and search] → Accepted: the error names the file and line, the same trade-off as day files. Skipping would leave a hole in the barcode check.
- [Hand edits can still give two non-archived foods the same barcode] → `food show --barcode` refuses to choose and names both, so the user fixes the files.
- [Fuzzy matching finds near-misses, such as `apple` finding `Ample Bars`] → Ranking puts exact and prefix matches first, and every query word must match, which keeps false positives rare. The budget table is simple to tune later if needed.
- [Reading names only means a food can't be found by its barcode through `search`] → Deliberate: `food show --barcode` is the exact lookup, and digits in slugs would otherwise match by accident.

## Migration Plan

None. No file format changes, and existing data is read as is. Foods that already share a barcode keep working, except that `food show --barcode` reports them as ambiguous.
