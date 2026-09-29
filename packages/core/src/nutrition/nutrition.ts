import type { Catalog } from "../catalog/catalog";
import { type ItemVersion, measureOf, refName } from "../catalog/units";
import type { ConfigService } from "../config/config-service";
import { NomnomError } from "../errors";
import type { Ingredient } from "../store/records";

/** Nutrient values keyed by id: every catalog nutrient, in catalog order. */
export type Nutrients = ReadonlyMap<string, number>;

export interface Nutrition {
	/** The nutrients in `amount` `unit` of an item version. */
	amountOf(item: ItemVersion, amount: number, unit: string): Promise<Nutrients>;
	/** The sum of the ingredients' contributions, as for a recipe that is not saved yet. */
	sumOf(ingredients: readonly Ingredient[]): Promise<Nutrients>;
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

/**
 * Calculates nutrients with full precision. Recipe totals are calculated
 * recursively and cached per `slug@version` for the run; only nutrients in the
 * current catalog are calculated, and absent values count as 0.
 */
export function createNutrition(deps: {
	catalog: Catalog;
	config: ConfigService;
}): Nutrition {
	const { catalog, config } = deps;
	const totals = new Map<string, Promise<Nutrients>>();

	const ids = async () => (await config.load()).nutrients.map(({ id }) => id);

	const amountOf = async (
		item: ItemVersion,
		amount: number,
		unit: string,
		stack: readonly string[],
	): Promise<Nutrients> => {
		const factor = unitFactor(item, unit);
		const { whole } = measureOf(item);
		const values =
			item.kind === "food"
				? item.record.nutrients
				: await recipeTotals(item, stack);
		const result = new Map<string, number>();
		for (const id of await ids()) {
			// Multiplied before dividing, so typed-in values give exact results where possible.
			result.set(id, ((values.get(id) ?? 0) * amount * factor) / whole);
		}
		return result;
	};

	const recipeTotals = (
		item: ItemVersion & { kind: "recipe" },
		stack: readonly string[],
	): Promise<Nutrients> => {
		const name = refName(item);
		// Checked before the cache: a recipe on the stack is still being calculated.
		if (stack.includes(name)) {
			const cycle = [...stack.slice(stack.indexOf(name)), name];
			throw new NomnomError(
				`Recipes reference each other in a cycle: ${cycle.join(" -> ")}`,
			);
		}
		let cached = totals.get(name);
		if (!cached) {
			cached = sum(item.record.ingredients, [...stack, name], name);
			totals.set(name, cached);
			// Failures are not cached, so each query reports them from its own start.
			cached.catch(() => totals.delete(name));
		}
		return cached;
	};

	const sum = async (
		ingredients: readonly Ingredient[],
		stack: readonly string[],
		within?: string,
	): Promise<Nutrients> => {
		const result = new Map((await ids()).map((id) => [id, 0]));
		// One at a time, so a cycle is always found on the stack rather than in the cache.
		for (const ingredient of ingredients) {
			let item: ItemVersion;
			try {
				item = await catalog.resolve(ingredient);
				if (item.kind !== ingredient.kind) {
					throw new NomnomError(
						`'${ingredient.slug}' is a ${item.kind}, not a ${ingredient.kind}`,
					);
				}
				unitFactor(item, ingredient.unit);
			} catch (error) {
				if (error instanceof NomnomError && within) {
					throw new NomnomError(
						`In recipe ${within}: ${error.message}`,
						error.problems,
					);
				}
				throw error;
			}
			const part = await amountOf(
				item,
				ingredient.amount,
				ingredient.unit,
				stack,
			);
			for (const [id, value] of part) {
				result.set(id, (result.get(id) ?? 0) + value);
			}
		}
		return result;
	};

	return {
		amountOf: (item, amount, unit) => amountOf(item, amount, unit, []),
		sumOf: (ingredients) => sum(ingredients, []),
	};
}
