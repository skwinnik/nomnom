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
config.yaml            nutrient catalog and meals (created with defaults on first run)
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

# Log a food or recipe (the rest of the words are the unit), or typed-in totals.
nomnom log breakfast apple 1 medium sized apple
nomnom log dinner --inline 'restaurant ramen' --kcal 800 --protein 35 --date 2026-09-29
```

`food add` and `recipe add` print the path of the new file; `recipe add` also prints its nutrients per serving and, with a yield, per 100 base units. `log` prints the line it added.

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
greek-yogurt-2-460123@1  150 g
apple@2                  1 medium sized apple   # a trailing comment

[dinner]
"restaurant ramen"       kcal=800 protein=35
```

- `[meal]` starts a section; every entry belongs to one. Repeated sections of a meal are merged, and a meal that is not in `config.yaml` is accepted with a warning.
- A reference entry is `<slug>@<version> <amount> [<unit>]`; the version is required, and without a unit the item's default unit is used.
- An inline entry is `"<description>" <nutrient>=<number> ...` with the totals eaten; required nutrients must be given.
- A `#` after whitespace starts a comment, except inside an inline entry's description.

Day files store entries only, never totals. `nomnom log` inserts one line into the meal's section (or adds the section in meal order) and leaves every other line exactly as it was. It refuses to write into a day file that has errors and lists them with their line numbers.

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
