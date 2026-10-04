# nomnom

## Setup

```bash
bun install             # installs deps, sets up Husky hooks and generates AI rules (rulesync)
bun run nomnom --help   # runs the CLI from source
```

To put `nomnom` on your `PATH`, link the CLI package once:

```bash
cd apps/cli && bun link
nomnom --help
```

## Usage

nomnom tracks calories and other nutrients. All data is plain text that you can read and edit by hand.

### Data directory

Data lives in `$NOMNOM_DIR`, or in `~/.nomnom` when `NOMNOM_DIR` is unset or empty:

```
config.yaml            nutrient catalog and meals (created with defaults by the first successful command)
foods/<slug>.yaml      one file per food, every version in it
recipes/<slug>.yaml    one file per recipe, every version in it
logs/<yyyy>/<yyyy-mm-dd>.nom   one file per day
```

### config.yaml

```yaml
nutrients:            # the catalog, in display order
  - id: kcal          # used as --kcal and kcal=800: a lowercase letter, then a-z, 0-9 or _
    name: Energy      # display name
    unit: kcal        # display unit
    required: true    # every food and inline entry must give it
  - id: protein
    name: Protein
    unit: g
meals: [breakfast, lunch, dinner, snack]   # in the order of a day: a-z, 0-9, - and _
```

The default catalog is `kcal` (required), `protein`, `fat`, `carbs` and `fiber`. A nutrient id can't be the name of a built-in option such as `name` or `date`. Every command that takes nutrient values gets one option per nutrient.

### Commands

```bash
# A food: nutrient values per --per (default 100) base units, extra units in base units.
nomnom food add --name Apple --base-unit g --kcal 52 --protein 0.3 \
  --units 'medium sized apple=180' --barcode 4601234567890

# A recipe: ingredients pin the latest version unless one is given; without a unit,
# the item's default unit is used (its base unit, or `serving` for a recipe without a yield).
nomnom recipe add --name 'Chicken Soup' --servings 4 --base-unit g --yield 1000 \
  --ingredient 'chicken-breast=300 g' --ingredient 'carrot@1=2 medium carrot' --units bowl=350

# Look up slugs and versions to pass to `log` and `recipe add`.
nomnom food list
nomnom recipe list
nomnom search chiken soop                   # fuzzy search over food and recipe names
nomnom food show apple-4601234567890        # the latest version; apple-4601234567890@1 for another
nomnom food show --barcode 0034000470693    # the food that has this barcode
nomnom recipe show chicken-soup

# Log a food or recipe (the rest of the words are the unit), or typed-in totals.
nomnom log breakfast apple-4601234567890 1 medium sized apple
nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35 --date 2026-09-29

# Optionally give the time it was eaten (HH:MM); nothing adds the current time for you.
nomnom log breakfast apple-4601234567890 1 medium sized apple --time 08:15
# Several entries in one call, each written like a day-file line and optionally with its own time.
nomnom log breakfast --entry '07:30 oats 60 g' --entry 'milk 200 ml' --entry '08:10 "hotel coffee" kcal=5'
nomnom log lunch --time 12:30 --entry 'rice 80 g' --entry 'chicken-soup 1 bowl'   # both at 12:30

# Report a day (default: today) by meal, or a range with totals and the average per logged day.
nomnom report 2026-09-29
nomnom report 2026-09-23 2026-09-29 --entries
nomnom report 2026-09-23 2026-09-29 --json
```

`food add` and `recipe add` print the path of the new file; `recipe add` also prints its nutrients per serving and, with a yield, per 100 base units. `log` prints each line it added, as written to the day file, such as `08:15 apple-4601234567890@1 1 medium sized apple`. `--time` sets the time of the entry, or of every `--entry` value without its own time; giving it together with a value that has its own time (even the same one) is an error, reported with every other invalid entry, and nothing is written. `log` never adds a time by itself: without `--time` or a prefix, the entry is untimed, whatever the date. A time goes only in `--time` or an `--entry` value, so `nomnom log breakfast 08:15 apple 1` is rejected, and an `--inline` description that looks like a time stays text. `report` calculates totals from the day files; the average leaves out today, which may not be over. It fails, printing nothing on standard output, when any day in the range has errors, and lists every one with its file and line.

In the text report, a timed entry shows its time before its name or description, as in `08:15 Apple  1 medium sized apple` or `19:30 "restaurant ramen"`; an untimed entry shows no time, and entries stay in file order. In `--json`, every entry has `time`: `"HH:MM"`, or `null` when the entry has none. Times never change a value or a total.

### Dry runs

Every command that writes (`food add|update|archive|unarchive`, `recipe add|update|archive|unarchive` and `log`) accepts `--dry-run`. It runs every check of a real run and prints its usual output with `Would create`, `Would update`, `Would archive` or `Would unarchive`, then each file it would write, and changes nothing:

```
$ nomnom log breakfast apple 150 g --dry-run
apple@2 150 g

/home/me/.nomnom/logs/2026/2026-09-30.nom
  oats@2 60 g
  milk@1 200 ml
+ apple@2 150 g

  [lunch]

Dry run: no files were changed.
```

A new file is shown in full, marked `(new file)`; for an existing file, the added lines start with `+ ` and two unchanged lines are shown on each side. A command writes its files only once it has succeeded: a command that fails, and `--help`, change nothing.

### Looking up foods and recipes

Output is plain text for people and scripts alike: the `<slug>@<version>` a command prints is exactly what `log` and `recipe add` accept, columns are separated by at least two spaces, and the name comes last.

`food list` and `recipe list` print every item that is not archived, by its latest version, sorted by slug. When there is none they print `No foods` or `No recipes`.

```
$ nomnom food list
apple-4601234567890@1          food  Apple
carrot@1                       food  Carrot
chicken-breast@1               food  Chicken Breast
greek-yogurt-2-034000470693@1  food  Greek Yogurt 2%
water@1                        food  Water
```

`food show` and `recipe show` print one version: the one given (`apple-4601234567890@1`) or the latest. Archived items are shown too, with `Archived: yes`, and an older version shows `Latest version: <n>`. `food show` only finds foods and `recipe show` only recipes. A food shows its stored values exactly as stored (`-` when not given); a recipe shows its nutrients as calculated, per serving and, with a yield, per 100 base units.

```
$ nomnom food show apple-4601234567890
apple-4601234567890@1  food  Apple
Created: 2026-09-29T20:10:00+03:00
Barcodes: 4601234567890
Per 100 g:
  Energy          52 kcal
  Protein        0.3 g
  Fat              - g
  Carbohydrates    - g
  Fiber            - g
Units:
  g                   base unit
  medium sized apple  180 g

$ nomnom recipe show chicken-soup
chicken-soup@1  recipe  Chicken Soup
Created: 2026-09-29T20:15:00+03:00
Servings: 4
Yield: 1000 g
Units:
  g        base unit
  serving  250 g
  bowl     350 g
Ingredients:
  chicken-breast@1  300 g
  carrot@1          2 medium carrot
  water@1           700 ml
Per serving:
  Energy         136.3 kcal
  Protein         23.3 g
  Fat              0.0 g
  Carbohydrates    0.0 g
  Fiber            0.0 g
Per 100 g:
  Energy         54.5 kcal
  Protein         9.3 g
  Fat             0.0 g
  Carbohydrates   0.0 g
  Fiber           0.0 g
```

`food show --barcode <digits>` shows the latest version of the food that has the barcode, instead of a slug. Barcodes are stored exactly as given but compared the way Open Food Facts normalizes them: leading zeros are removed, then a code of 1 to 7 digits is padded with zeros to 8 digits and one of 9 to 12 digits to 13. So the UPC-A code `034000470693` and its EAN-13 form `0034000470693` are the same barcode. A food's barcodes are those of its latest version, and archived foods hold none. `food add` rejects a barcode that another food already has, and two barcodes in one command that are the same.

```
$ nomnom food show --barcode 0034000470693
greek-yogurt-2-034000470693@1  food  Greek Yogurt 2%
Created: 2026-09-29T20:10:00+03:00
Barcodes: 034000470693
...
```

`search <text>` searches the names of foods and recipes that are not archived, together. The query and the names are split into words like slugs are. Every query word must match a word of the name, in any order; the start of a word is enough, and typos are allowed: none for words of 1 to 3 characters, one for 4 to 7 and two for 8 or more (an edit inserts, deletes or replaces a character, or swaps two adjacent ones). Results with the fewest edits come first, then by slug. Only names are searched, not slugs or barcodes.

```
$ nomnom search chiken soop
chicken-soup@1  recipe  Chicken Soup
$ nomnom search yogrt
greek-yogurt-2-034000470693@1  food  Greek Yogurt 2%
$ nomnom search xyz
No foods or recipes match 'xyz'
```

Commands that read every food or recipe (`food list`, `food show --barcode`, `food add`, `recipe list` and `search`) fail when any file they read is invalid, naming it. In `foods/` and `recipes/`, every `*.yaml` file must be named after a valid slug; other files and directories are ignored.

### Foods and recipes

Foods and recipes are immutable and versioned. Each file holds one YAML document per version, each a full snapshot starting with `---`; nomnom never changes an existing document. Entries and ingredients pin exact versions (`apple@2`), so the same entries always give the same totals.

The slug (file name) is the name in lowercase with every run of other characters than letters and digits replaced by `-`, plus `-<first barcode>` for a food with barcodes: `Greek Yogurt 2%` becomes `greek-yogurt-2`. Foods and recipes share one namespace of slugs.

```yaml
# foods/apple.yaml
---
version: 1
created: 2026-09-29T20:10:00+03:00
name: Apple
barcodes:
  - "4601234567890"   # always quoted
base_unit: g
per: 100              # the nutrient values are per 100 g
nutrients:            # only the values given; absent ones count as 0
  kcal: 52
  protein: 0.3
units:                # unit name: amount of base units
  medium sized apple: 180
```

```yaml
# recipes/chicken-soup.yaml
---
version: 1
created: 2026-09-29T20:15:00+03:00
name: Chicken Soup
servings: 4           # one `serving` is 1/4 of the recipe
base_unit: g          # base_unit and yield: the cooked amount, both or neither
yield: 1000
units:                # only with a yield
  bowl: 350
ingredients:          # nutrients are calculated from these, never stored
  - food: chicken-breast
    version: 2
    amount: 300
    unit: g
  - recipe: chicken-stock
    version: 1
    amount: 500
    unit: g
```

A recipe always allows the unit `serving`; with a yield it also allows its base unit and its units. A version with `archived: true` archives the item: it can't be newly referenced, but pinned references keep working. Unit names are trimmed, their inner whitespace is collapsed to one space, and they can't contain `#`.

### Day files

```
# lines starting with # are comments
[breakfast]
07:45 greek-yogurt-2-460123@1  150 g
apple@2                        1 medium sized apple   # a trailing comment

[dinner]
19:30 "restaurant ramen"       kcal=800 protein=35
```

- `[meal]` starts a section; every entry belongs to one. Repeated sections of a meal are merged, and a meal that is not in `config.yaml` is accepted with a warning.
- A reference entry is `<slug>@<version> <amount> [<unit>]`; the version is required, and without a unit the item's default unit is used.
- An inline entry is `"<description>" <nutrient>=<number> ...` with the totals eaten; required nutrients must be given.
- Either kind of entry may start with a time and whitespace, as in `08:15 apple@2 1 medium sized apple`. The time is optional and strictly `HH:MM`, from `00:00` to `23:59`. It is the local wall-clock time on the file's date, with no time zone; a time skipped or repeated by a daylight saving change is kept as written. Entries are never sorted by time, and a time need not match its meal.
- A line whose first word is digits followed by `:` must start with a valid time and an entry: `8:15 apple@2 1`, `24:00 …`, `08:15apple@2 1`, a time alone or a time before a comment, a section header or another time are errors with the line number. Text inside an inline description, as in `"lunch at 12:30"`, is never a time, and slugs starting with digits, such as `7up@1 1 can`, are unaffected.
- A `#` after whitespace starts a comment, except inside an inline entry's description.

Day files store entries only, never totals. `nomnom log` inserts its lines, in the order given and whatever their times, at the end of the meal's section (or adds the section in meal order) and leaves every other line exactly as it was. It refuses to write into a day file that has errors and lists them with their line numbers.

## Layout

nomnom is a Bun workspace. The CLI depends on core, never the other way round.

| Path             | Package        | Contents                                                                 |
| ---------------- | -------------- | ------------------------------------------------------------------------ |
| `packages/core/` | `@nomnom/core` | All business logic: services, ports (`FileSystem`, `Clock`), adapters, `NomnomError` |
| `apps/cli/`      | `@nomnom/cli`  | The `nomnom` command: a thin wrapper that parses arguments, prints help and output, and sets exit codes |

The boundaries between them (core never prints or touches the process, only adapters touch the file system, only tests import mocks) are enforced by Biome. See `.rulesync/rules/architecture.md`.

## Scripts

| Script                   | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `bun test`               | Run the tests of every workspace                               |
| `bun run typecheck`      | Type-check every workspace (`tsc --noEmit`)                    |
| `bun run nomnom <args>`  | Run the CLI from source                                        |
| `bun run check`          | Biome format + lint check                                      |
| `bun run check:fix`      | Biome format + lint with auto-fix                              |
| `bun run format`         | Biome format only                                              |
| `bun run lint`           | Biome lint only                                                |
| `bun run rules:generate` | Generate AI rules from `.rulesync/`                            |
| `bun run openspec:update` | Refresh OpenSpec skills and commands                          |

## Tooling

- **Biome** – formatter and linter (`biome.json`).
- **Husky + lint-staged** – the pre-commit hook runs `biome check --write` on staged files, then `bun run typecheck`.
- **rulesync** – single source of AI rules in `.rulesync/rules/`, generated for Claude Code (`CLAUDE.md`, `.claude/rules/`) and the AGENTS.md standard (`AGENTS.md`, `.agents/memories/`). Generated files are gitignored. Don't run `rulesync gitignore`: `.gitignore` is maintained by hand so the OpenSpec files stay committed.
- **OpenSpec** – spec-driven development in `openspec/`. Skills (`.claude/skills/`, `.agents/skills/`) and Claude commands (`.claude/commands/opsx/`) are generated by OpenSpec itself and committed; refresh with `bun run openspec:update`.
