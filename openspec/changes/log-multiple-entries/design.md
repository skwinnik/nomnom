## Context

This design assumes `add-dry-run` has been applied and archived. By then, `log` declares `writes: true`, every write goes through the staged file system, and the runner commits after a successful command and holds standard output until the commit. The dry-run preview trims the common prefix and suffix of a file, so it shows one changed region.

Today, `DayLogService.log(input: LogInput)` builds one line and runs it through `parseLine` and `checkEntry`, the rules of a hand-written line. It then reads and validates the day once with `readDay`, refuses to write when the file has errors, and writes once with `insertEntry` + `replaceAtomic`. `LogInput` holds the text of one entry: `ref`/`amount`/`unit` for a reference, `inline`/`nutrients` for an inline entry. The service also enforces that the two can't be mixed. A reference is built by `referenceLine`, which throws on the first problem it finds (the reference, the amount, `catalog.resolve(..., { newReference: true })` for unknown and archived items, `unitFactor`). An inline entry is built by `inlineLine`, and `checkEntry` then collects every problem.

`parseLine` removes a trailing comment in silence (`stripComment`). Problems from `checkEntry` that concern the entry itself have `file: ""`. The runner prints each problem as `${file}${:line}: ${message}`, so such a problem currently prints as `: message`.

## Goals / Non-Goals

**Goals:**
- One code path for all three forms. Positional and `--inline` input become a list with one entry, so checking, inserting and printing never differ by form.
- Checks stay in core, so they are testable in `DayLogService` tests without the CLI.
- One read and one write of the day file per call, whatever the number of entries.

**Non-Goals:**
- Changing the errors of the single-entry forms. They keep failing on their first problem, with the same messages.
- Making the text grammar of the single-entry forms the same as `--entry`'s.

## Decisions

### `LogInput` gains `entries`; the service picks the form

```ts
export interface LogInput {
	meal: string;
	date?: string;
	ref?: string; amount?: string; unit?: string;          // positional form, as today
	inline?: string; nutrients?: Readonly<Record<string, string | undefined>>; // --inline, as today
	/** --entry values, as typed. */
	entries?: readonly string[];
}

export interface Logged {
	path: string;
	date: string;
	/** The lines added, in order. */
	lines: string[];
	warnings: Problem[];
}
```

When `entries` is non-empty, `ref`, `amount`, `unit`, `inline` and every nutrient value must be absent. Otherwise the service throws "Give --entry values, or one entry as a food or recipe with an amount or with --inline, not both". The CLI passes `values.entry ?? []` and nothing more.

Alternative considered: a list of tagged entry inputs (`{ ref, amount } | { inline, nutrients } | { text }`), built by the CLI. The CLI would then have to detect mixed forms and stray nutrient options, checks that are in core today. The flat input keeps them in core and changes the CLI the least.

### Build every entry, collect problems per entry, then touch the file

```
log(input)
  |- meal configured? date valid?                (as today, fail fast)
  |- form check                                  (entries vs single form)
  |- single form:  line = referenceLine | inlineLine; parseLine + checkEntry
  |                -> throws as today
  |- --entry:      for i, text of entries:
  |                  try  build(text) -> line; parseLine + checkEntry
  |                  catch/collect -> problems labelled "entry i+1 '<text>': ..."
  |                any problems -> throw NomnomError("Can't log <k> of <n> entries", problems)
  |- readDay once; errors -> throw as today
  `- replaceAtomic(insertEntries(lines, meal, built, meals))
```

- An `--entry` problem is `{ file: "", message: "entry <n> '<text>': <message>" }`, where `<n>` is the 1-based position among the `--entry` values and `<text>` is the value trimmed. A problem that `checkEntry` locates in another file (a broken recipe that a reference uses) keeps its file and line and follows the entry's own problem.
- A thrown `NomnomError` while building one entry becomes one problem for it (plus any problems it carries). Any other exception is not caught.
- Entries are built one after another. Every build resolves through the catalog, which is already cached per run.
- The message `Can't log <k> of <n> entries` gives the count. When only one `--entry` was given, it is `Can't log the entry`, and the labelled problem follows as usual.

### Parsing an `--entry` value: `parseEntryText` in `daylog/parse.ts`

```ts
/** An --entry value: a day-file entry line whose reference may omit the version. Throws NomnomError. */
export function parseEntryText(text: string):
	| { kind: "reference"; ref: ItemRef; amount: number; unit?: string }
	| Extract<LineContent, { kind: "inline" }>;
```

- Trim the value. Reject an empty value, one starting with `#` (a comment) or `[` (a section header): "expected an entry such as 'apple 1' or '\"ramen\" kcal=800'".
- Comments: for a reference, any `#` is rejected. For an inline entry, any `#` after the closing quote is rejected. A `#` inside the description is kept. The message is "entries can't contain comments ('#'); add comments to the day file by hand". The check runs before the rest of the parsing, so the value isn't rejected with a misleading unit error first (`normaliseUnitName` also rejects `#`).
- An inline value goes through the existing `parseInline`, which the comment check leaves with no comment to strip.
- A reference splits on whitespace like `parseReference`, but uses `parseItemRef` (version optional), `tryParseNumber` with the same positive-amount message, and `normaliseUnitName` for the unit words.

The built line then goes through `parseLine` + `checkEntry`, as the single forms do. So an `--entry` line passes exactly the checks of a hand-written line, and `parseEntryText` only has to cover the version being optional and comments being rejected.

Alternative considered: running `parseLine` on the value directly. It rejects a missing version and removes comments in silence, the two points where `--entry` must behave differently.

### Standard form from shared builders

`referenceLine` is split so that the positional form and `--entry` share the second half:

```
positional strings --parseItemRef/parseNumber/normaliseUnitName--+
                                                                 v
parseEntryText(reference) ------------------------------> pinReference({ ref, amount, unit? })
                                                          resolve(newReference) + default unit + unitFactor
                                                          -> "<slug>@<version> <amount> <unit>"
```

For an inline `--entry`, `checkEntry` runs on the parsed content first: unknown nutrient ids, duplicates and missing required nutrients. Only then is the line written as `"<description>" <id>=<value> ...` in catalog order. Writing first would drop an unknown id before the check could report it. `--inline` keeps using `parseNutrientInput`, which already produces catalog order.

### `insertEntry` becomes `insertEntries`

`insertEntries(lines, meal, entries: readonly string[], meals)` finds the insert point exactly as today and splices all entries there, or puts them all after the new `[meal]` header. It has one caller, so the old function goes. Inserting a block gives the same result as inserting the lines one after another, since each new line becomes the section's last entry. The tests pin that equivalence.

### CLI

- `log` declares `entry: { type: "string", multiple: true, valueName: "line", description: "An entry as in a day file: 'apple 1 medium apple' or '\"ramen\" kcal=800'; without a version the latest is pinned (repeatable)" }`. It has no short alias, like `--ingredient`.
- `run` passes `entries: values.entry ?? []` and prints `logged.lines.map((l) => `${l}\n`).join("")`. The positional descriptions stay. The summary stays "Log what you ate".
- `reportError` prints a problem whose `file` is empty as its message alone. This also fixes the current `: message` output of single-form inline problems.

### Dry run

Nothing specific is needed. The block is one contiguous insertion, so the `add-dry-run` preview shows it as one region of `+` lines with context. The invalid-entry case fails before anything is staged, so the runner prints no preview.

## Risks / Trade-offs

- [Shell quoting of inline entries (`'"ramen" kcal=800'`) is awkward to type] → `--inline` stays for a single inline entry typed by hand. Agents, the main users of several entries, quote without trouble.
- [Two grammars for a reference on the command line: positional words and `--entry` text] → Both mean the same, and `--entry` is the positional form quoted. The help of `--entry` shows an example.
- [An agent retries a failed call] → All or nothing means a retry never duplicates part of a meal.
- [Several regions in one preview] → Can't happen: one call inserts at one point, because it logs one meal.
- [`Logged.line` becomes `lines`] → The mocked `dayLog` service and the `log` command tests change with it. There are no other callers.
