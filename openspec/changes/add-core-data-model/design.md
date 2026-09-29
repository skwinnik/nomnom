## Context

The repository is a Bun and TypeScript project with Biome, Husky and OpenSpec set up, and only a placeholder `index.ts`. There is no application code, so this change sets the module structure and conventions that later changes will follow. See `proposal.md` for motivation and the specs for the behavior contract.

Constraints:
- Data must remain plain text that people can read and edit by hand, so the tool must tolerate hand edits and never rewrite content it didn't create.
- Foods and recipes are immutable and versioned; log entries and recipe ingredients pin exact versions.

## Goals / Non-Goals

**Goals:**
- A small, testable core: loading config, reading and writing foods and recipes, calculating nutrients, and parsing and editing day files, independent of the CLI layer.
- CLI commands `food add`, `recipe add`, `log` and `validate log`.

**Non-Goals:**
- Updating, renaming or archiving through the CLI (archived versions are only read and respected).
- Reports across days, listing and searching. Day totals are stored in the day file, but there is no command that displays or aggregates them beyond what `log` prints.
- Validating food and recipe files as a command (`validate foods`, `validate recipes`). They are validated when read.
- A configurable start of day, times on log entries, and editing or deleting log entries through the CLI.
- Locking against concurrent nomnom processes.

## Decisions

### Module layout

```
src/
  cli.ts            entry point: subcommand dispatch, error printing, exit codes
  commands/         food-add.ts, recipe-add.ts, log.ts, validate-log.ts
                    (argument parsing -> core calls)
  core/
    paths.ts        data directory resolution and file paths
    config.ts       default config, loading and validation
    slug.ts         slug rule
    units.ts        unit name normalisation, unit tables, reference parsing
    store.ts        versioned YAML files: read all versions, create a new file
    catalog.ts      shared namespace: resolve slug -> food or recipe, latest version
    nutrition.ts    per-item and recipe nutrient calculation, cycle detection
    daylog/
      parse.ts      line-level parser that keeps the raw text of every line
      validate.ts   semantic checks against config and catalog
      totals.ts     day totals calculation, formatting, staleness check
      insert.ts     insertion of one line into the raw lines, totals line upsert
```

The core modules take the data directory, config and (where needed) the current time as parameters instead of reading globals. This lets tests run against temporary directories with fixed timestamps. `package.json` gets a `bin` entry `nomnom -> src/cli.ts` with a `#!/usr/bin/env bun` shebang, and `index.ts` is removed.

### YAML library: `yaml` (npm) instead of `Bun.YAML`

Bun 1.3 has a built-in `Bun.YAML` that parses multi-document files, but it returns a plain object for a single document and an array for several, and its `stringify` output leaves trailing spaces. The `yaml` package provides `parseAllDocuments` (a uniform list of documents with positions for error messages) and predictable, configurable output, including quoting of strings such as `"0123"` and unit names containing `:`. One small, widely used dependency is worth reliable round-tripping of user data.

### Versioned files: append-only documents

Every version document starts with `---`. Creating a food or recipe writes a new file opened with the exclusive-create flag (`wx`), so a race or a leftover file can never be overwritten. That flag also enforces the shared-namespace check at the filesystem level for the target folder. Future updates will append a document to the file, never rewrite it. Reading validates each document (fields, version sequence 1..N) and reports errors with the file path and document number.

Barcodes are stored as strings, and the writer forces quotes on them so they survive being read back as strings.

### CLI argument parsing: `node:util` `parseArgs` with options built from the config

Nutrient flags depend on `config.yaml`, so each command loads the config first, then builds the `parseArgs` options: the command's built-in options plus one `string` option per nutrient id, with `strict: true` so that unknown flags such as `--protien` fail. Repeatable options (`--units`, `--barcode`, `--ingredient`) use `multiple: true`. Values are parsed into numbers by a single helper that rejects `NaN`, infinities and empty strings.

The names of built-in options are collected in one list that config validation also uses, so a nutrient id can't shadow an option.

Alternatives: commander or citty. They add dependencies and don't handle options that depend on the config any better.

### Parsing references and units

Shared helpers parse `<slug>[@<version>]`, `<name>=<amount>` (split at the last `=`) and `<slug>[@v]=<amount> [unit]` (split at the first `=`, since slugs never contain `=`). Unit names are normalised in one function (trim, collapse whitespace, reject empty text and `#`), used both when defining units and when looking them up from the CLI or a log line. This makes `medium  sized apple` typed by hand match `medium sized apple`.

Each version gets a unit table `Map<unitName, factor>` that includes its implicit units (the base unit for foods and for recipes with a yield; `serving` for recipes). The same table drives validation and calculation.

### Nutrient calculation

`nutrition.ts` returns totals as `Record<nutrientId, number>` for "amount X in unit U of item slug@v":
- food: `value * amount * factor / per`
- recipe: `recipeTotals(slug@v) * fraction`, where fraction = `amount * factor / yield` for base and additional units, or `amount / servings` for `serving`

Recipe totals are calculated recursively and cached per `slug@v` within one run. A stack of the versions currently being resolved detects cycles and reports the chain. Only nutrients in the current catalog are calculated, and absent ones count as 0. Calculations use full floating-point precision, and values are rounded (one decimal place) only when printed.

### Day files: keep raw lines, edit by insertion

The parser keeps each line's raw text next to its parsed form (`blank | comment | totals | section | reference | inline | error`) and its line number. Validation is a separate pass with access to config and catalog, so parse errors and semantic errors are all collected and reported together. Inserting works on the raw line array. It finds the insertion index using the placement rules in the spec, splices in one line (plus a header and blank lines for a new section), and joins the lines back together. Lines that aren't touched are never re-serialised, so comments, alignment and hand formatting survive.

Writes to a day file go to a temporary file in the same folder, which is then renamed over the original, so an interrupted write can't truncate a day.

Lines written by the CLI use single spaces (`slug@v amount unit`). Numbers are printed in the shortest form that reads back as the same value (JavaScript `String(number)`).

### Day totals: stored output, compared as text

The totals line is saved output, not data. Pinned versions make the values it's calculated from stable, but a hand edit or a new catalog nutrient can still make it wrong, so the entries are always what counts. This leads to three rules:
- **Totals-line problems are warnings.** A stale line must never block logging, or a single hand edit would lock the day until someone fixed it by hand.
- **Staleness is a text comparison.** The totals are recalculated and formatted with the same function that writes them, and the result is compared with the stored line after trimming. This avoids tolerances for floating-point comparison, and a new catalog nutrient counts as stale because the formatted text differs.
- **Writing always recalculates.** Every write (`log`, `validate log --fix`) removes every existing totals line from the raw lines and puts one fresh line at index 0, followed by a blank line when the next line isn't blank. The raw-line approach stays intact, because only totals lines are ever dropped.

Totals use the same `nutrition.ts` calculation as recipes, so a reference entry and a recipe ingredient with the same amount always agree. Rounding to one decimal happens only in the formatter.

`validate log` scans `logs/*/` for files named `<yyyy-mm-dd>.nom` in the folder of their year. It runs parse, validate and staleness checks per file, and collects results so one bad file doesn't stop the others. The catalog cache is shared across files, so validating many days that pin the same recipe calculates that recipe once.

### Timestamps and dates

`created` uses local time with an explicit offset (for example `2026-09-29T20:10:00+03:00`), produced by a small formatter, because `Date.toISOString()` only produces UTC. The default `--date` is the local date. The clock is passed into the core as a parameter so tests can fix it.

### Errors

Errors a user can fix are thrown as a dedicated `NomnomError` carrying a message and an optional list of located problems (`file:line: message`). `cli.ts` prints these to stderr and exits with status 1. Unexpected exceptions keep their stack traces.

## Risks / Trade-offs

- [Hand edits break a food or recipe file, or an existing version] → Reading validates every document and reports the file and document number. The tool never rewrites these files itself, so it can't make the damage worse.
- [Floating-point noise in totals (e.g. 545.0199999)] → Calculations use full precision, and only displayed values are rounded. Stored inputs are exactly what the user typed.
- [Unicode slugs vary by normalisation form (é as one code point or as e plus an accent)] → Names are normalised to NFC before slugging, so the same visible name always gives the same filename.
- [A nutrient id in the config may be a JavaScript prototype key such as `constructor`] → Nutrient maps use `Object.create(null)` or `Map`. Ids are validated against the reserved option names.
- [Refusing to log into a day file that has errors can block logging] → The error lists exact file and line numbers so the fix is quick. This is preferable to writing into a file whose structure was misread.
- [Stored totals go stale after hand edits or config changes] → `validate log` reports it, and `validate log --fix` or the next `log` for that day repairs it. Nothing reads the stored totals as input, so a stale line can mislead someone reading the file but never corrupts a calculation.
- [Adding a nutrient to the config makes every stored totals line stale] → This is expected: `validate log --fix` rewrites them all in one run. Only totals lines change, and entries are untouched.
- [No locking between concurrent nomnom runs] → Creating a file with `wx` protects foods and recipes. For day files, the last writer wins, which is acceptable for a single-user CLI.
