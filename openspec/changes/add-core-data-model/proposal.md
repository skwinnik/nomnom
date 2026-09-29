## Why

nomnom is a CLI tool for tracking calories and other nutritional values, with all data stored as plain text that is readable and editable by hand. The repository has tooling only, no application code yet, so it needs its core data model before any other feature can be built: where data lives, how foods and recipes are defined and versioned, and how daily consumption is logged.

## What Changes

- Add the `nomnom` CLI entry point (Bun, TypeScript).
- Add a data directory resolved from `NOMNOM_DIR` (default `$HOME/.nomnom`) with `config.yaml`, `foods/`, `recipes/` and `logs/`. A default `config.yaml` is created automatically when missing.
- `config.yaml` defines the nutrient catalog (id, display name, unit, whether it is required) and the list of meals. `kcal` is required by default.
- Add `nomnom food add`. Foods are immutable and versioned: one YAML file per food holds every version as a separate YAML document, each a full snapshot. A food has a name, barcodes, a base unit, nutrient values per N base units, and arbitrary named units with their conversion to the base unit. The filename is a slug of the name plus the first barcode.
- Add `nomnom recipe add`. A recipe is versioned like a food and lists ingredients with pinned versions, amounts and units. An ingredient can be a food or another recipe. A recipe has an optional cooked yield (in its own base unit) and a number of servings (default 1). Its nutrients are calculated from its ingredients, not stored.
- Foods and recipes share one namespace: a slug is unique across both folders.
- Archiving is a version with `archived: true`. Archived items can't be newly referenced, but existing pins still resolve.
- Add a plain-text daily log format: `logs/<yyyy>/<yyyy-mm-dd>.nom`, with meal sections, comments, pinned references to foods or recipes (`slug@version amount unit`), and inline entries with typed-in nutrient totals (`"description" kcal=800`). Hand-written files are supported.
- Each day file stores the day's nutrient totals on its first line (`= kcal=1340.5 protein=82.3 ...`). Because every reference is pinned to an immutable version, stored totals stay correct until the entries themselves change. The entries remain the source of truth, and the totals line is saved output.
- Add `nomnom log`, which inserts one entry into a day's file and refreshes its totals line, without reformatting anything else in it.
- Add `nomnom validate log`, which reports errors and stale or missing totals in day files, and `nomnom validate log --fix`, which rewrites the totals lines.

## Capabilities

### New Capabilities

- `data-directory`: data directory resolution, directory layout, and `config.yaml` (nutrient catalog and meals).
- `foods`: food records, versioning, slugs and filenames, units, the shared namespace, archiving, and `food add`.
- `recipes`: recipe records, pinned and nested ingredients, yield and servings, nutrient calculation, and `recipe add`.
- `daily-log`: the `.nom` day file format, its parsing and validation rules, stored day totals, `nomnom log` and `nomnom validate log`.

### Modified Capabilities

None. There are no existing specs.

## Impact

- New source tree under `src/` and a `nomnom` bin entry in `package.json`. The placeholder `index.ts` is replaced.
- New runtime dependency: the `yaml` package, for reading and writing multi-document YAML.
- Out of scope, planned as later changes: updating foods and recipes (including renames, which produce a new file), archive commands, reports across days (weeks, months, trends), validation of food and recipe files, list and search commands, and a configurable start of day.
