## Context

See `proposal.md` for motivation. The checks `check` needs mostly exist in `@nomnom/core`, but each one runs only where some command happens to need it:

- `config/parse-config.ts` and `store/parse.ts` collect every problem of `config.yaml` or of one food or recipe file, with line numbers. Each throws one `NomnomError` carrying those problems.
- `VersionedStore.foodSlugs()` and `recipeSlugs()` throw on the *first* file name that is not a slug. `Catalog.find` throws when a slug is both a food and a recipe, and `Catalog.all()` throws the first failure.
- Resolving a reference and checking its unit is written out four times: `daylog/validate.ts` (`checkEntry`), `nutrition/nutrition.ts` (`sum`, which also checks the kind), `DayLogService` (`referenceLine`) and `RecipeService` (`pin`). All four call `catalog.resolve` and then `unitFactor`.
- Recipe ingredients are checked only while nutrients are calculated, and only up to the first failure. Cycles are found the same way.
- Nothing lists `logs/`: `DataPaths.day(date)` computes each day's path.
- Barcode uniqueness is checked only in `FoodService` (`foodsWithBarcode`).

## Goals / Non-Goals

**Goals:**
- One reference check, used by every command, that also knows whether a failure lies in the reference or in its target.
- `check` built on the same parsers and validators as the other commands, so it can't disagree with them.
- Deterministic output: the same data always gives the same problems in the same order.

**Non-Goals:**
- Calculating nutrients in `check`. The ingredient and cycle checks cover what a calculation could fail on.
- Changing file formats, the `FileSystem` port, or how other commands print errors.
- Speed beyond reading every file once. Data directories hold hundreds of small files, not millions.

## Decisions

### One reference check that classifies its failures

A new `catalog/reference.ts` provides:

```
resolveReference(deps: { catalog, config }, ref: { slug, version? },
                 options: { unit?, kind?, newReference? })
  -> { item: ItemVersion, unit: string }        // unit: given, or the default unit
  throws NomnomError        the reference is wrong: unknown slug, missing version,
                            other kind, unit not allowed, archived (newReference)
  throws TargetError        the target is broken: catalog.find failed (invalid file,
  (extends NomnomError)     slug in both dirs), or the food version is unusable
```

The steps are ordered to match the classification: `catalog.find` (a failure here is a `TargetError`), then undefined → unknown slug, archived check, `pickVersion`, kind, usability (`TargetError`), then `unitFactor`. The four current call sites use it: `checkEntry`, `nutrition.sum` (with `kind`), `DayLogService.referenceLine` and `RecipeService.pin` (with `newReference`). Messages stay as they are, and callers that throw today still throw.

`TargetError` is a subclass rather than a returned tag, so the callers that just propagate errors (`log`, `recipe add`, nutrition) don't change shape. Only the collectors (`validateDay` and `check`) inspect it.

Alternative considered: tagging problems with a `cause` field on `Problem`. That would widen a type the CLI prints and the JSON report exposes, only for `check`'s benefit.

### Usability is a pure function of a food version and the catalog

`foods/usable.ts` exports `usabilityProblems(record: FoodVersion, nutrients: readonly Nutrient[]): string[]`. It returns one message per missing required nutrient and per stored id not in the catalog, with the same wording as `checkInline` (`the required nutrient 'kcal' is missing`, `'protien' is not a nutrient in config.yaml`). `resolveReference` joins the messages into a `TargetError` naming `<slug>@<version>`, and `check` reports each as `version <n>: <message>` at the food file.

The check sits at the reference, not in `store/parse.ts`, for two reasons. The spec keeps unusable versions out of file validity, so `food show`, `list`, `search` and the barcode checks keep working. And the parser stays independent of the config. `nutrition.amountOf` doesn't check again: every path to a calculation goes through `resolveReference` first (day validation, ingredients in `sum`, `log`, `pin`).

### `validateDay` can leave out target problems

`ValidationContext` gains `omitTargetProblems?: boolean`. When it is set, `checkEntry` drops a `TargetError` instead of reporting it at the line. `log` and `report` leave it unset and keep reporting everything at the line. Only `check` sets it, because it reports the target itself.

### Store: every invalid file name, not the first

`VersionedStore` gains `scanFoods()` and `scanRecipes()`, which return `{ slugs, invalid: Problem[] }`, one problem per `*.yaml` name that is not a slug. `foodSlugs()` and `recipeSlugs()` build on them and throw one `NomnomError` carrying all invalid names, so the other commands keep their behaviour and gain complete error lists.

### The check service

`check/check-service.ts` exposes `CheckService.check(): Promise<CheckResult>`:

```
CheckResult
  errors:   Problem[]      grouped by file, in output order
  warnings: Problem[]
  checked:  { foods, recipes, days }   file counts for the success line
```

It returns data and throws only for an invalid `config.yaml`, which `config.load()` already throws in the usual way. The CLI decides how to print. The flow:

```
config.load()                                     invalid -> throws, nothing else runs
scanFoods / scanRecipes                           invalid names
readFood / readRecipe per slug (catch)            file problems; valid files kept as items
slugs in both lists                               at foods/<slug>.yaml
every food version: usabilityProblems             "version N: ..."
latest non-archived versions: group by
  normaliseBarcode                                once per barcode, at the first slug
every recipe version, every ingredient:
  resolveReference({ unit, kind })                NomnomError -> "version N, ingredient M
                                                  (<slug>@<v>): ..."; TargetError -> skip
recipe graph: strongly connected components      once per group, at the first version
walk logs/                                        invalid .nom names; valid dates
per date, in order: readDay with
  omitTargetProblems                              errors, warnings
```

Problems go into a `Map<file, Problem[]>` created in output order (config, food files by slug, recipe files by slug, `logs/` paths sorted). That keeps each file's problems together, whichever check found them. The catalog's per-run cache means each food or recipe file is parsed once, however many references it has.

### Cycles: strongly connected components over parsed versions

The nodes are recipe versions from files that parsed. The edges are ingredients that pin a recipe version that exists. Tarjan's algorithm, visiting nodes and edges in `slug@version` order, gives each group of versions that reach one another. A group is reported when it has more than one version, or when its one version pins itself. The message names the group's versions in code point order: `version 1: recipes reference each other in a cycle: a@1, b@1, c@1`. It is located at the first of them.

Alternatives considered:
- Running `nutrition` on every recipe version finds cycles too, but it reports every recipe that contains one, the cycle's own versions included.
- DFS with back edges reports one path per back edge, and can leave out versions that are on a cycle.

Neither meets "once per group".

### Walking `logs/`

`check/day-files.ts` walks `logs/` recursively with `FileSystem.list` and keeps entries that are files whose name ends with `.nom`. A file is a day file when its name without `.nom` passes `isIsoDate` and `paths.day(date)` equals its path. Anything else gets the problem `not a day file: day files are logs/<yyyy>/<yyyy-mm-dd>.nom`. Dates are returned sorted, and `readDay` is called for each of them. No `FileSystem` change is needed.

### CLI command

`apps/cli/src/commands/check.ts` defines `check` with no positionals or options. It prints warnings with the existing `printWarnings`. When there are errors, it throws `NomnomError("<n> errors in <m> files", errors)`, so the runner prints them the same way as every other user-fixable error. Otherwise it prints the success line. The singular and plural forms are handled by a small helper next to the command. `check` doesn't declare `writes: true` (from `add-dry-run`), since it writes nothing.

## Risks / Trade-offs

- [Existing data becomes unusable after upgrading, for example old foods without `kcal`, so `report` starts failing] → Accepted by the user. `nomnom check` lists every affected version in one run. The proposal marks the change as BREAKING.
- [`log-multiple-entries` also edits `daylog/validate.ts` and `daylog/daylog-service.ts`] → Whichever change is applied second adapts to the other. The overlap is the reference check call, which both keep.
- [Recipe ingredient problems carry no line number, because parsed records don't keep document positions] → Messages name the version and ingredient number, which is enough to find them in a small file. Line numbers can be added later without a spec change.
- [An ingredient pinning an invalid file or an unusable version is skipped at the recipe] → By design. The target is reported, and a second run after fixing it catches anything left.
- [A day with validation errors is not calculated by `check`, just as by `report`] → Nothing is lost: `check` doesn't calculate days at all, because ingredient and cycle problems are reported at the recipes.
