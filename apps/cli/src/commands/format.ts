import type {
	ItemSummary,
	NutrientAmount,
	RecipeNutrients,
	StoredNutrient,
	VersionChange,
} from "@nomnom/core";

/**
 * Rows as aligned columns: every column but the last is padded to its widest
 * value plus two spaces, and the last is printed as is. Each line starts with
 * `indent` and ends with a line break.
 */
export function formatColumns(
	rows: readonly (readonly string[])[],
	indent = "",
): string {
	const widths: number[] = [];
	for (const row of rows) {
		row.slice(0, -1).forEach((cell, i) => {
			widths[i] = Math.max(widths[i] ?? 0, cell.length);
		});
	}
	return rows
		.map((row) => {
			const cells = row.map((cell, i) =>
				i < row.length - 1 ? cell.padEnd((widths[i] ?? 0) + 2) : cell,
			);
			return `${indent}${cells.join("").trimEnd()}\n`;
		})
		.join("");
}

/** One line per item: `<slug>@<version>`, the kind and the name, aligned across the output. */
export function formatItems(items: readonly ItemSummary[]): string {
	return formatColumns(
		items.map((item) => [`${item.slug}@${item.version}`, item.kind, item.name]),
	);
}

/** A titled table of nutrients rounded to one decimal place. */
export function formatNutrients(
	title: string,
	nutrients: readonly NutrientAmount[],
): string {
	return nutrientTable(
		title,
		nutrients.map((n) => [n.name, n.value.toFixed(1), n.unit]),
	);
}

/** A recipe's nutrient tables: per serving and, with a yield, per 100 base units. */
export function formatRecipeNutrients(nutrients: RecipeNutrients): string[] {
	const tables = [formatNutrients("Per serving", nutrients.perServing)];
	if (nutrients.perHundred) {
		tables.push(
			formatNutrients(
				`Per 100 ${nutrients.perHundred.unit}`,
				nutrients.perHundred.nutrients,
			),
		);
	}
	return tables;
}

export type WriteVerb = "Created" | "Updated" | "Archived" | "Unarchived";

const CONDITIONAL: Record<WriteVerb, string> = {
	Created: "Would create",
	Updated: "Would update",
	Archived: "Would archive",
	Unarchived: "Would unarchive",
};

/** A verb that reports a write, in the conditional for a dry run: `Would create`. */
export function writeVerb(verb: WriteVerb, dryRun: boolean): string {
	return dryRun ? CONDITIONAL[verb] : verb;
}

/**
 * The first lines of an update: `Updated <path> (version N)`, or after a
 * rename `Created <path>` and `Archived <old path> (version N)`.
 */
export function formatUpdated(
	path: string,
	version: number,
	archived: { path: string; version: number } | undefined,
	dryRun: boolean,
): string {
	return archived
		? `${writeVerb("Created", dryRun)} ${path}\n${formatArchived(archived.path, archived.version, { archived: true, dryRun })}`
		: `${writeVerb("Updated", dryRun)} ${path} (version ${version})\n`;
}

/** `Archived <path> (version N)`, or `Unarchived` when `archived` is false. */
export function formatArchived(
	path: string,
	version: number,
	options: { archived: boolean; dryRun: boolean },
): string {
	const verb = options.archived ? "Archived" : "Unarchived";
	return `${writeVerb(verb, options.dryRun)} ${path} (version ${version})\n`;
}

/**
 * One indented line per change: `<field>: <before> -> <after>` with `(none)`
 * for an absent value, `<field>: added|removed <item>` and
 * `<field>: order changed`. Nutrients are named by their id alone.
 */
export function formatChanges(changes: readonly VersionChange[]): string {
	return changes.map((change) => `  ${formatChange(change)}\n`).join("");
}

function formatChange(change: VersionChange): string {
	if (change.kind === "reordered") return `${change.field}: order changed`;
	if (change.kind !== "changed") {
		return `${change.field}: ${change.kind} ${change.item}`;
	}
	const label =
		change.key === undefined
			? change.field
			: change.field === "nutrients"
				? change.key
				: `${change.field}.${change.key}`;
	return `${label}: ${change.before ?? "(none)"} -> ${change.after ?? "(none)"}`;
}

/** A titled table of stored nutrient values, printed as stored, or `-` when absent. */
export function formatStoredNutrients(
	title: string,
	nutrients: readonly StoredNutrient[],
): string {
	return nutrientTable(
		title,
		nutrients.map((n) => [
			n.name,
			n.value === undefined ? "-" : String(n.value),
			n.unit,
		]),
	);
}

function nutrientTable(title: string, rows: readonly string[][]): string {
	const nameWidth = Math.max(...rows.map(([name = ""]) => name.length));
	const valueWidth = Math.max(...rows.map(([, value = ""]) => value.length));
	const lines = rows.map(
		([name = "", value = "", unit = ""]) =>
			`  ${name.padEnd(nameWidth)}  ${value.padStart(valueWidth)} ${unit}`,
	);
	return `${title}:\n${lines.join("\n")}\n`;
}
