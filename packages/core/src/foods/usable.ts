import type { Nutrient } from "../config/config";
import type { FoodVersion } from "../store/records";

/**
 * Why a food version is unusable under the current nutrient catalog: one
 * message per stored id that is not in the catalog, then one per required
 * nutrient that is missing. Empty when the version is usable.
 */
export function usabilityProblems(
	record: FoodVersion,
	nutrients: readonly Nutrient[],
): string[] {
	const problems: string[] = [];
	const known = new Set(nutrients.map(({ id }) => id));
	for (const id of record.nutrients.keys()) {
		if (!known.has(id))
			problems.push(`'${id}' is not a nutrient in config.yaml`);
	}
	for (const nutrient of nutrients) {
		if (nutrient.required && !record.nutrients.has(nutrient.id)) {
			problems.push(`the required nutrient '${nutrient.id}' is missing`);
		}
	}
	return problems;
}
