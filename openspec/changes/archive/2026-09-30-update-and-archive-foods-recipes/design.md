## Context

Foods and recipes are stored as append-only multi-document YAML files (see the `foods` and `recipes` specs). Today `VersionedStore` can only read files and create them at version 1 with `FileSystem.createExclusive`. `FoodService.add` and `RecipeService.add` validate their text input, derive the slug, check the shared namespace through `Catalog.ensureSlugFree`, and create the file. `Catalog.resolve(ref, { newReference: true })` already rejects archived items, and every command reads a file fully, validating every document, before using it.

`add` and `update` must behave the same way, so this change is mostly about reusing `add`'s input handling and adding one write path: appending a version.

This change builds on `add-catalog-lookup`, which adds barcode normalization, the rule that a barcode belongs to at most one non-archived food, and `foodsWithBarcode(normalized)` in the food service.

## Goals / Non-Goals

**Goals:**
- One validation path for a new version, shared by `add` and `update`.
- Appending that keeps the existing bytes of a file untouched, without widening the `FileSystem` port.
- One comparison of two versions that both rejects identical updates and produces the printed changes.

**Non-Goals:**
- Locking between concurrent nomnom processes (as in the core data model).
- Linking a renamed item to its old slug in the files. The old item is archived, and nothing records where it went.
- Showing previous versions or a history of changes.

## Decisions

### Appending a version: read, then replace the whole file

`VersionedStore` gains `appendFood(slug, fields)` and `appendRecipe(slug, fields)`. Each reads the file, parses it (so an invalid file is reported, not extended), numbers the new document `latest + 1`, stamps `created` from the `Clock`, and writes `text + (text ends with "\n" ? "" : "\n") + serialised document` with `FileSystem.replaceAtomic`. Because the new content is the old text plus a suffix, existing documents are byte for byte unchanged by construction. The store picks the version number itself instead of trusting the caller, so a caller can't write a gap or a duplicate.

Alternative considered: a new `FileSystem.append` operation (`O_APPEND`). It would avoid rewriting the file, but a crash mid-write could leave half a document. It would also mean changing the port, the adapter, the in-memory mock and the contract suite for no visible benefit. Food files are small, so rewriting them costs nothing.

### Shared input handling for add and update

The body of `FoodService.add` up to the write (name, base unit, `per`, nutrients, units, barcodes and their conflict check, slug) moves into one function that turns `FoodAddInput` into a slug and a `NewFoodVersion`. `add` and `update` both call it, so defaults, error messages and validation are identical by construction. `RecipeService` does the same with `RecipeAddInput`: the function covers servings, yield, units and pinning each `--ingredient` through `catalog.resolve(ref, { newReference: true })`. `update` additionally rejects an ingredient whose slug is the recipe being updated.

The CLI does the same with option definitions: `food update` and `recipe update` reuse the options of `food add` and `recipe add`, plus a required `<slug>` positional, so their help and parsing can't drift apart.

### Update flow

```
update(slug, input)
  item = catalog.find(slug)          -> error: neither / wrong kind / archived
  { newSlug, next } = shared input handling (as add)
                                     -> error: barcode held by another active food (slug excluded)
  latest = item.versions.at(-1)
  changes = diff(latest, next)
  if newSlug == slug:
      changes empty?                 -> error: nothing changed
      appendX(slug, next)
  else:
      catalog.ensureSlugFree(newSlug)
      createX(newSlug, next)                        # write 1
      appendX(slug, { ...latest, archived: true })  # write 2
  return paths, versions, changes (+ nutrients for recipes)
```

Every check runs before the first write. A rename writes twice. Creating the new file comes first: if the archiving write then fails, the error says the new file was created and the old item isn't archived yet, and `archive` fixes it. The other order could leave the old item archived with no replacement.

### Archive and unarchive

A shared helper in each service reads the item through `catalog.find`, checks its kind and current `archived` state, and appends the latest version's fields with the flag changed. It goes straight to the store, not through `catalog.resolve`, so a recipe's ingredient pins are copied as data and never re-checked as new references.

### Barcodes

`foodsWithBarcode` gains an optional slug to leave out: `foodsWithBarcode(normalized, exceptSlug?)`. `add` passes none. `update` passes `<slug>`, which covers both outcomes: when the slug is kept, the food keeps its own barcodes; on a rename, the check runs before the first write, while the old food is still active, and the command archives that food itself. `unarchive` checks each barcode of the latest version with its own slug left out, and fails on the first hit. `archive` needs no check, since archived foods hold no barcodes.

### Comparing versions

A pure module (`versions/diff.ts`, or next to the records) provides `diffFood(before, after)` and `diffRecipe(before, after)`, which return a list of changes. `version`, `created` and `archived` are never compared: an update never targets an archived item, and its new version is never archived. The change kinds are:

- a scalar field changed: `name`, `base_unit`, `per`, `servings`, `yield`, with before and after, where "absent" is a valid value (a recipe losing its yield)
- a map entry added, removed or changed: `nutrients.<id>`, `units.<name>`, compared by key regardless of order
- a list item added or removed: barcodes, and ingredients (each shown as `slug@version amount unit`), compared as multisets
- a list whose items are the same but in another order

An empty list means identical. Core returns the changes as data with values already turned into text (numbers via `String(number)`, as in day files), and the CLI formats them one per line:

```
Updated foods/apple.yaml (version 3)
  kcal: 52 -> 55
  fiber: 2.4 -> (none)
  units.small sized apple: 134 -> (none)
```

Nutrients the catalog no longer contains are compared too, so an update that drops one reports it.

### Command output

- `food update` / `recipe update`: `Updated <path> (version N)`, or for a rename `Created <new path>` and `Archived <old path> (version N)`, then the changes. `recipe update` then prints the nutrient tables with the existing `formatNutrients`.
- `archive` / `unarchive`: `Archived <path> (version N)` / `Unarchived <path> (version N)`.

## Risks / Trade-offs

- [Full re-entry drops a field that was forgotten, or a default like `per: 100` replaces a stored value] → The printed changes show every removed or changed field, and a follow-up update fixes it. Old versions and the references to them are never affected.
- [Nutrient values under ids no longer in the catalog can't be given on the command line, so an update drops them] → Accepted. They are ignored in calculations anyway, stay in the earlier versions, and the changes report them as removed.
- [Two nomnom processes adding versions to the same file at once: the later `replaceAtomic` loses the other version] → Same as day files: acceptable for a single-user CLI.
- [A rename fails between its two writes, leaving two active items] → The error names both files and the fix (`food archive <old>` / `recipe archive <old>`). Until then the two foods share their barcodes, and `food show --barcode` reports them as ambiguous.
- [After a rename, nothing in the files links the new slug to the old one] → Accepted: the name in the archived file and the timestamps make it traceable by hand. A link can be added later without changing existing files.
- [The catalog caches items for the run, so it's stale after a write] → Each command ends after its writes, and nothing reads the catalog after writing.
