## Why

nomnom is a CLI tool for tracking calories and other nutritional values, with all data stored as plain text that is readable and editable by hand. The repository has its workspace structure (`@nomnom/core` and `@nomnom/cli`) but no features yet, so it needs its core data model before any other feature can be built: where data lives, how foods and recipes are defined and versioned, and how daily consumption is logged.

## What Changes

- Add the first features to the existing workspace: core services in `@nomnom/core` and commands in `@nomnom/cli`.
- Add a data directory resolved from `NOMNOM_DIR` (default `$HOME/.nomnom`) with `config.yaml`, `foods/`, `recipes/` and `logs/`. A default `config.yaml` is created automatically when missing.
- `config.yaml` defines the nutrient catalog (id, display name, unit, whether it is required) and the list of meals. `kcal` is required by default.
- Add `nomnom food add`. Foods are immutable and versioned: one YAML file per food holds every version as a separate YAML document, each a full snapshot. A food has a name, barcodes, a base unit, nutrient values per N base units, and arbitrary named units with their conversion to the base unit. The filename is a slug of the name plus the first barcode.
- Add `nomnom recipe add`. A recipe is versioned like a food and lists ingredients with pinned versions, amounts and units. An ingredient can be a food or another recipe. A recipe has an optional cooked yield (in its own base unit) and a number of servings (default 1). Its nutrients are calculated from its ingredients, not stored.
- Foods and recipes share one namespace: a slug is unique across both folders.
- Archiving is a version with `archived: true`. Archived items can't be newly referenced, but existing pins still resolve.
- Add a plain-text daily log format: `logs/<yyyy>/<yyyy-mm-dd>.nom`, with meal sections, comments, pinned references to foods or recipes (`slug@version amount unit`), and inline entries with typed-in nutrient totals (`"description" kcal=800`). Hand-written files are supported.
- Day files store entries only, never calculated values. Day totals and other aggregates are calculated from the entries when they are needed. Because every reference is pinned to an immutable version, the same entries always give the same totals.
- Add `nomnom log`, which inserts one entry into a day's file without reformatting anything else in it. It refuses to write into a day file that has errors and reports them with their line numbers.

## Capabilities

### New Capabilities

- `data-directory`: data directory resolution, directory layout, and `config.yaml` (nutrient catalog and meals).
- `foods`: food records, versioning, slugs and filenames, units, the shared namespace, archiving, and `food add`.
- `recipes`: recipe records, pinned and nested ingredients, yield and servings, nutrient calculation, and `recipe add`.
- `daily-log`: the `.nom` day file format, its parsing and validation rules, and `nomnom log`.

### Modified Capabilities

None. There are no existing specs.

## Impact

- New services, ports and adapters in `@nomnom/core` (`packages/core/`), and new commands in `@nomnom/cli` (`apps/cli/`).
- New runtime dependency of `@nomnom/core`: the `yaml` package, for reading and writing multi-document YAML.
- Out of scope, planned as later changes: updating foods and recipes (including renames, which produce a new file), archive commands, reports (day totals and summaries across weeks, months and trends, calculated from the entries on the fly), validate commands for day files, foods and recipes, list and search commands, and a configurable start of day.
