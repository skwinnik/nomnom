## Context

The repository is a Bun workspace with two packages and no features yet: `@nomnom/core` (`packages/core/`) has the `FileSystem` and `Clock` ports with their adapters, `NomnomError` and an empty `createServices`, and `@nomnom/cli` (`apps/cli/`) has a runner that derives parsing and help from `defineCommand` definitions, with an empty command list. This change adds the first services and commands on top of that structure, following the architecture, CLI and testing rules. See `proposal.md` for motivation and the specs for the behavior contract.

Constraints:
- Data must remain plain text that people can read and edit by hand, so the tool must tolerate hand edits and never rewrite content it didn't create.
- Foods and recipes are immutable and versioned; log entries and recipe ingredients pin exact versions.

## Goals / Non-Goals

**Goals:**
- A small, testable core: loading config, reading and writing foods and recipes, calculating nutrients, and parsing and editing day files, independent of the CLI layer.
- CLI commands `food add`, `recipe add` and `log`.

**Non-Goals:**
- Updating, renaming or archiving through the CLI (archived versions are only read and respected).
- Reports of any kind, listing and searching. Day files store no calculated values; day totals and summaries across days will be calculated from the entries by later report commands.
- Validate commands (`validate log`, `validate foods`, `validate recipes`). Day files are validated when `log` reads them, and foods and recipes when they are read.
- A configurable start of day, times on log entries, and editing or deleting log entries through the CLI.
- Locking against concurrent nomnom processes.

## Decisions

### Module layout

```
packages/core/src/
  index.ts            public API: every service interface and createServices
  services.ts         createServices: wires every service below
  errors.ts           NomnomError (existing)
  clock/, fs/         Clock and FileSystem ports and adapters (existing)
  data-dir/           layout of the data directory and file paths
  config/             ConfigService: default config, loading and validation
  shared/             slug rule, unit name normalisation, number and reference parsing
  store/              versioned YAML files: read all versions, create a new file
  catalog/            shared namespace: resolve slug -> food or recipe, latest version, unit tables
  nutrition/          per-item and recipe nutrient calculation, cycle detection
  foods/              FoodService: food add
  recipes/            RecipeService: recipe add
  daylog/
    parse.ts          line-level parser that keeps the raw text of every line
    validate.ts       semantic checks against config and catalog
    insert.ts         insertion of one line into the raw lines
    daylog-service.ts DayLogService: log

apps/cli/src/
  index.ts            composition root: resolves NOMNOM_DIR, builds services, resolves CommandContext
  commands/           food-add.ts, recipe-add.ts, log.ts, registered in commands/index.ts
  __mocks__/          mocks of the core services the commands use
```

Each area keeps its tests next to the files and its mocks in a `__mocks__/` folder beside them. Every service is created by a factory that takes its dependencies as one object, does no I/O, and is wired in `createServices`.

`createServices` gains a `dataDir` dependency: a plain value that `apps/cli/src/index.ts` resolves from `NOMNOM_DIR`, falling back to `$HOME/.nomnom`. `ConfigService.load()` creates the default config when it is missing, validates it, and caches it for the run. The CLI calls it in `resolveContext` to build the nutrient options. Services that need the nutrient catalog or the meals depend on `ConfigService`.

All file access goes through the `FileSystem` port, which already has the operations this change needs: `createExclusive` for new food and recipe files, `replaceAtomic` for day files, and `readText` and `exists` for reading. Timestamps come from the injected `Clock`.

### YAML library: `yaml` (npm) instead of `Bun.YAML`

Bun 1.3 has a built-in `Bun.YAML` that parses multi-document files, but it returns a plain object for a single document and an array for several, and its `stringify` output leaves trailing spaces. The `yaml` package provides `parseAllDocuments` (a uniform list of documents with positions for error messages) and predictable, configurable output, including quoting of strings such as `"0123"` and unit names containing `:`. One small, widely used dependency is worth reliable round-tripping of user data. It is a dependency of `@nomnom/core` only, and being plain TypeScript, it is allowed outside adapters.

### Versioned files: append-only documents

Every version document starts with `---`. Creating a food or recipe writes a new file with `FileSystem.createExclusive`, which throws `FileExistsError` if the file exists, so a race or a leftover file can never be overwritten. That also enforces the shared-namespace check at the filesystem level for the target folder. Future updates will append a document to the file, never rewrite it. Reading validates each document (fields, version sequence 1..N) and reports errors with the file path and document number.

Barcodes are stored as strings, and the writer forces quotes on them so they survive being read back as strings.

### CLI options built from the config

Nutrient flags depend on `config.yaml`, so `food add`, `recipe add` and `log` declare `options` as a function of `CommandContext`, which gains the loaded config. Each returns the command's built-in options plus one `string` option per nutrient id. The runner resolves the context once per run and uses the same options for parsing and help, so unknown flags such as `--protien` fail and every nutrient flag appears in `--help`. Repeatable options (`--units`, `--barcode`, `--ingredient`) use `multiple: true`. Values are parsed into numbers in core by a single helper that rejects `NaN`, infinities and empty strings, so commands stay thin.

The names of built-in options are collected in one list in core that config validation also uses, so a nutrient id can't shadow an option.

### Parsing references and units

Shared helpers parse `<slug>[@<version>]`, `<name>=<amount>` (split at the last `=`) and `<slug>[@v]=<amount> [unit]` (split at the first `=`, since slugs never contain `=`). Unit names are normalised in one function (trim, collapse whitespace, reject empty text and `#`), used both when defining units and when looking them up from the CLI or a log line. This makes `medium  sized apple` typed by hand match `medium sized apple`.

Each version gets a unit table `Map<unitName, factor>` that includes its implicit units (the base unit for foods and for recipes with a yield; `serving` for recipes). The same table drives validation and calculation.

### Nutrient calculation

The nutrition module returns nutrients as `Record<nutrientId, number>` for "amount X in unit U of item slug@v":
- food: `value * amount * factor / per`
- recipe: `recipeTotals(slug@v) * fraction`, where fraction = `amount * factor / yield` for base and additional units, or `amount / servings` for `serving`

Recipe totals are calculated recursively and cached per `slug@v` within one run. A stack of the versions currently being resolved detects cycles and reports the chain. Only nutrients in the current catalog are calculated, and absent ones count as 0. Calculations use full floating-point precision, and values are rounded (one decimal place) only when printed.

### Day files: keep raw lines, edit by insertion

The parser keeps each line's raw text next to its parsed form (`blank | comment | section | reference | inline | error`) and its line number. Validation is a separate pass with access to config and catalog, so parse errors and semantic errors are all collected and reported together. Inserting works on the raw line array. It finds the insertion index using the placement rules in the spec, splices in one line (plus a header and blank lines for a new section), and joins the lines back together. Lines that aren't touched are never re-serialised, so comments, alignment and hand formatting survive.

Writes to a day file go through `FileSystem.replaceAtomic` (a temporary file in the same folder, then a rename), so an interrupted write can't truncate a day.

Lines written by the CLI use single spaces (`slug@v amount unit`). Numbers are printed in the shortest form that reads back as the same value (JavaScript `String(number)`).

### No stored totals

Day files hold entries only. A stored totals line would duplicate what the entries already define, and a hand edit or a new catalog nutrient would make it stale. Keeping it correct would need staleness checks, warnings and a repair command. Pinned versions make the calculation deterministic, so future reports recalculate totals from the entries on the fly with the same nutrition module that recipes use, and a reference entry and a recipe ingredient with the same amount always agree.

Alternative considered: storing the day's totals on the first line of the file, so they can be read at a glance. Rejected, because it adds a second source of truth and the machinery to keep it in sync.

### Timestamps and dates

`created` uses local time with an explicit offset (for example `2026-09-29T20:10:00+03:00`), produced by a small formatter from `Clock.now()`, because `Date.toISOString()` only produces UTC. The default `--date` is the local date of `Clock.now()`. Tests fix the time with the clock mock.

### Errors

Errors a user can fix are thrown from core as `NomnomError` with a list of located problems (`{ file, line?, message }`). The CLI runner already prints them to stderr as `file:line: message` and returns exit status 1. Unexpected exceptions keep their stack traces. Warnings, such as an unknown meal in a day file, are returned by the service as problems alongside its result, and the command prints them.

## Risks / Trade-offs

- [Hand edits break a food or recipe file, or an existing version] → Reading validates every document and reports the file and document number. The tool never rewrites these files itself, so it can't make the damage worse.
- [Floating-point noise in calculated nutrients (e.g. 545.0199999)] → Calculations use full precision, and only displayed values are rounded. Stored inputs are exactly what the user typed.
- [Unicode slugs vary by normalisation form (é as one code point or as e plus an accent)] → Names are normalised to NFC before slugging, so the same visible name always gives the same filename.
- [A nutrient id in the config may be a JavaScript prototype key such as `constructor`] → Nutrient maps use `Object.create(null)` or `Map`. Ids are validated against the reserved option names.
- [Refusing to log into a day file that has errors can block logging] → The error lists exact file and line numbers so the fix is quick. This is preferable to writing into a file whose structure was misread.
- [Without `validate log`, an error in a day file goes unnoticed until the next `log` for that day] → Acceptable for now: `log` reports it with the line number, and a validate command can be added later without changing the file format.
- [Recalculating totals from the entries in every report costs time over many days] → Recipe totals are cached per `slug@v` within a run, and pinned versions make results safe to cache across runs if that becomes necessary.
- [No locking between concurrent nomnom runs] → Creating a file with `createExclusive` protects foods and recipes. For day files, the last writer wins, which is acceptable for a single-user CLI.
