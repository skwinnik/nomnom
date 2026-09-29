## Why

The `foods` and `recipes` specs define immutable versions and archiving, but the CLI can only create version 1 (`food add`, `recipe add`). Fixing a value, adapting a recipe, renaming an item or retiring it means hand-editing YAML. Pinned references already keep logs and recipes on the version they were written with, so what's missing is a safe way to add versions and to archive and unarchive items.

## What Changes

- Add `nomnom food update <slug>` and `nomnom recipe update <slug>`. An update takes exactly the same options, defaults and validation as `add`, and the values given form the complete new version: nothing is carried over from the previous version. A recipe's ingredients follow `recipe add`'s rules: without a version the latest one is pinned, and archived items are refused.
- The slug always follows the current name (and, for foods, the first barcode). When an update keeps the slug, it appends a new version to the file. When the new name or barcodes give a different slug, the update creates a new file at version 1 and archives the old item.
- An update identical to the latest version is rejected, and an update of an archived item is rejected.
- Barcodes follow the uniqueness rule from `add-catalog-lookup`. An update may keep the food's own barcodes, also when it renames the food, and unarchiving fails when another non-archived food has taken one of its barcodes.
- An update prints what changed from the previous version, so a field left out by mistake is visible. `recipe update` also prints the new version's nutrients, like `recipe add`.
- Add `nomnom food archive|unarchive <slug>` and `nomnom recipe archive|unarchive <slug>`. Each appends a copy of the latest version with the archived flag set or cleared. Archiving an archived item or unarchiving an active one fails.
- Existing references are never changed. Day files and recipes keep the versions they pin, and there is no re-pinning: a recipe moves to newer ingredient versions only through a `recipe update` that lists its ingredients again.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `foods`: slugs follow the name and first barcode on every version the CLI writes; new versions are appended to the file; the shared namespace applies to files created by updates; new `food update`, `food archive` and `food unarchive` commands.
- `recipes`: slugs follow the name on every version the CLI writes; new `recipe update`, `recipe archive` and `recipe unarchive` commands.

## Impact

- `@nomnom/core`: `VersionedStore` gains appending a version to an existing food or recipe file. `FoodService` and `RecipeService` gain `update`, `archive` and `unarchive`, sharing input validation with `add`. There is a new comparison of two versions, used both to reject identical updates and to report changes.
- `@nomnom/cli`: six new commands. `food update` and `recipe update` reuse the option definitions of `food add` and `recipe add`.
- No change to the file formats, the daily log, or the `FileSystem` port.
- Depends on `add-catalog-lookup` (barcode normalization and uniqueness, `foodsWithBarcode`). Apply and archive that change first.
- Out of scope: re-pinning or moving recipe ingredients or log entries to newer versions, patch-style updates, list, show and search commands, and warnings when archiving an item that active recipes use.
