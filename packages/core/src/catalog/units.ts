import { NomnomError } from "../errors";
import { SERVING } from "../shared/units";
import type { FoodVersion, RecipeVersion } from "../store/records";

export type ItemVersion =
	| {
			readonly kind: "food";
			readonly slug: string;
			readonly record: FoodVersion;
	  }
	| {
			readonly kind: "recipe";
			readonly slug: string;
			readonly record: RecipeVersion;
	  };

/**
 * How amounts of an item version are measured. `units` maps every allowed unit
 * to its size in the item's measure, and `whole` is the size of what the
 * nutrient values describe, so an amount in a unit is the fraction
 * `amount * units.get(unit) / whole` of those values:
 * - food: base units; `whole` is `per`
 * - recipe with a yield: base units; `whole` is the yield; one serving is yield / servings
 * - recipe without a yield: servings; `whole` is the number of servings
 */
export interface Measure {
	readonly units: ReadonlyMap<string, number>;
	readonly whole: number;
	/** The unit used when a reference gives none. */
	readonly defaultUnit: string;
}

export function measureOf(item: ItemVersion): Measure {
	if (item.kind === "food") {
		const { baseUnit, units, per } = item.record;
		return {
			units: new Map([[baseUnit, 1], ...units]),
			whole: per,
			defaultUnit: baseUnit,
		};
	}
	const { yield: cooked, servings, units } = item.record;
	if (!cooked) {
		return {
			units: new Map([[SERVING, 1]]),
			whole: servings,
			defaultUnit: SERVING,
		};
	}
	return {
		units: new Map([
			[cooked.baseUnit, 1],
			[SERVING, cooked.amount / servings],
			...units,
		]),
		whole: cooked.amount,
		defaultUnit: cooked.baseUnit,
	};
}

/** Every unit the item version allows, with its size in the item's measure. */
export function unitTable(item: ItemVersion): ReadonlyMap<string, number> {
	return measureOf(item).units;
}

/** The size of `unit` in the item's measure; throws when the version does not allow it. */
export function unitFactor(item: ItemVersion, unit: string): number {
	const { units } = measureOf(item);
	const factor = units.get(unit);
	if (factor === undefined) {
		throw new NomnomError(
			`'${unit}' is not a unit of ${refName(item)}; it allows ${[...units.keys()].map((name) => `'${name}'`).join(", ")}`,
		);
	}
	return factor;
}

export function refName(item: {
	slug: string;
	record: { version: number };
}): string {
	return `${item.slug}@${item.record.version}`;
}
