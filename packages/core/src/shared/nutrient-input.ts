import type { Nutrient } from "../config/config";
import { NomnomError } from "../errors";
import { parseNumber } from "./numbers";

/**
 * Parses nutrient values typed as text, keyed by nutrient id. Rejects ids that
 * are not in the catalog and negative values, and requires the required
 * nutrients. The result holds only the values given, in catalog order.
 */
export function parseNutrientInput(
	input: Readonly<Record<string, string | undefined>>,
	catalog: readonly Nutrient[],
): Map<string, number> {
	for (const id of Object.keys(input)) {
		if (input[id] !== undefined && !catalog.some((n) => n.id === id)) {
			throw new NomnomError(`'${id}' is not a nutrient in config.yaml`);
		}
	}
	const values = new Map<string, number>();
	const missing: string[] = [];
	for (const nutrient of catalog) {
		const text = input[nutrient.id];
		if (text === undefined) {
			if (nutrient.required) missing.push(nutrient.id);
			continue;
		}
		values.set(
			nutrient.id,
			parseNumber(text, `'${nutrient.id}'`, "non-negative"),
		);
	}
	if (missing.length > 0) {
		throw new NomnomError(
			`Missing required nutrient${missing.length > 1 ? "s" : ""}: ${missing.map((id) => `'${id}'`).join(", ")}`,
		);
	}
	return values;
}
