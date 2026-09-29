import type { ItemSummary, NutrientAmount, StoredNutrient } from "@nomnom/core";

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
