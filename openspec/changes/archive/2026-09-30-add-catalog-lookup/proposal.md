## Why

nomnom can add foods and recipes but can't read them back: the only way to find a slug or its latest version, which `nomnom log` and `recipe add` need, is to open `foods/*.yaml` and `recipes/*.yaml` by hand. Barcodes are stored but never read, even though barcode and label scanning live in a separate tool that hands digits over to nomnom, so nomnom has to resolve those digits to an existing food. Nothing stops two foods from sharing a barcode today either: the slug check doesn't catch it, because the name comes first in the slug, and `034000470693` (UPC-A) and `0034000470693` (EAN-13) aren't recognised as the same product.

## What Changes

- Add `nomnom food list` and `nomnom recipe list`: every non-archived food or recipe, one line each, as `<slug>@<latest version>  <kind>  <name>`.
- Add `nomnom food show <slug>[@<version>]` and `nomnom recipe show <slug>[@<version>]`: one version of one item, the latest by default, including archived items. `food show` reads only foods and `recipe show` only recipes; a slug of the other kind is not found.
- Add `nomnom food show --barcode <digits>`: resolves digits to the one non-archived food that has that barcode.
- Add `nomnom search <text>` at the root: fuzzy search over the names of non-archived foods and recipes together. It tolerates typos and matches word prefixes, in any word order, and ranks results by how closely they match.
- Compare barcodes the way Open Food Facts normalizes them, so a UPC-A code and its EAN-13 form are the same barcode. Barcodes are still stored exactly as given.
- `food add` rejects a barcode that a non-archived food already has, and two barcodes in one command that normalize to the same value. Archived foods don't hold their barcodes.
- Output is plain text meant for both agents and people: the `slug@version` a command prints is exactly what `log` and `recipe add` accept, columns are separated by at least two spaces, and free text comes last on a line.
- A broken food or recipe file makes every command that reads it fail, naming the file. `list`, `search` and `food add` read every relevant file, so any broken one makes them fail.

## Capabilities

### New Capabilities

- `search`: `nomnom search`, fuzzy name matching over foods and recipes, and how results are ranked and printed.

### Modified Capabilities

- `foods`: barcode normalization and uniqueness, `food add` rejecting conflicting barcodes, and the new `food list` and `food show` commands (including lookup by barcode).
- `recipes`: the new `recipe list` and `recipe show` commands.

## Impact

- `@nomnom/core`: the versioned store and the catalog learn to list every food and recipe (using the existing `FileSystem.list`, no port change); `FoodService` and `RecipeService` gain `list` and `show`; a new search service with its own fuzzy matcher; barcode normalization shared by `food add` and `food show --barcode`.
- `@nomnom/cli`: new commands `food list`, `food show`, `recipe list`, `recipe show` and `search`, their mocks and tests, and the README.
- No new dependencies. No changes to the file formats, to `nomnom log` or to existing data.
- Out of scope: a barcode option on `log` (callers resolve with `food show --barcode`, which also gives them the food's units), machine-readable output, accent folding and transliteration in search, "did you mean" suggestions, markers for outdated ingredient pins, UPC-E expansion and variable-weight barcodes.
