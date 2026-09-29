import type { Catalog } from "../catalog/catalog";
import { measureOf } from "../catalog/units";
import type { Nutrient } from "../config/config";
import type { ConfigService } from "../config/config-service";
import { NomnomError } from "../errors";
import {
	type Nutrients,
	type Nutrition,
	unitFactor,
} from "../nutrition/nutrition";
import { parseNumber } from "../shared/numbers";
import { parseAmountRef } from "../shared/references";
import { slugify } from "../shared/slug";
import { normaliseUnitName, parseUnits, SERVING } from "../shared/units";
import type { Ingredient, RecipeVersion } from "../store/records";
import type { VersionedStore } from "../store/versioned-store";

/** A new recipe as typed on the command line: every value is still text. */
export interface RecipeAddInput {
	name: string;
	/** `<slug>[@<version>]=<amount> [<unit>]` each. */
	ingredients: readonly string[];
	/** Default 1. */
	servings?: string;
	/** Given together with `yield`. */
	baseUnit?: string;
	yield?: string;
	/** `<name>=<amount>` each; needs a yield. */
	units?: readonly string[];
}

/** A calculated nutrient value with the catalog's display name and unit. */
export interface NutrientAmount {
	id: string;
	name: string;
	unit: string;
	value: number;
}

export interface RecipeAdded {
	slug: string;
	/** The path of the created file. */
	path: string;
	recipe: RecipeVersion;
	/** Every catalog nutrient, in catalog order. */
	perServing: NutrientAmount[];
	/** Present when the recipe has a yield: nutrients in 100 base units. */
	perHundred?: { unit: string; nutrients: NutrientAmount[] };
}

export interface RecipeService {
	/**
	 * Validates a new recipe, pins its ingredients and calculates its nutrients,
	 * then writes it as version 1. Writes nothing when anything fails.
	 */
	add(input: RecipeAddInput): Promise<RecipeAdded>;
}

export function createRecipeService(deps: {
	config: ConfigService;
	catalog: Catalog;
	nutrition: Nutrition;
	store: VersionedStore;
}): RecipeService {
	const { config, catalog, nutrition, store } = deps;

	const pin = async (text: string): Promise<Ingredient> => {
		const ref = parseAmountRef(text);
		const item = await catalog.resolve(ref, { newReference: true });
		const unit = ref.unit ?? measureOf(item).defaultUnit;
		unitFactor(item, unit);
		return {
			kind: item.kind,
			slug: item.slug,
			version: item.record.version,
			amount: ref.amount,
			unit,
		};
	};

	return {
		async add(input) {
			const { nutrients: nutrientCatalog } = await config.load();
			const name = input.name.trim();
			if (name === "") throw new NomnomError("The name must not be empty");
			if (input.ingredients.length === 0) {
				throw new NomnomError("A recipe needs at least one --ingredient");
			}
			const servings = parseNumber(
				input.servings ?? "1",
				"'servings'",
				"positive",
			);
			const cooked = parseYield(input);
			const units = parseUnits(input.units ?? [], cooked?.baseUnit);
			if (units.has(SERVING)) {
				throw new NomnomError(
					`'${SERVING}' is reserved: every recipe has it as 1 / servings of the recipe`,
				);
			}
			if (units.size > 0 && !cooked) {
				throw new NomnomError(
					"Units need a yield: give --yield and --base-unit too",
				);
			}

			const ingredients: Ingredient[] = [];
			for (const text of input.ingredients) ingredients.push(await pin(text));

			const slug = slugify(name);
			await catalog.ensureSlugFree(slug);
			const totals = await nutrition.sumOf(ingredients);

			const { path, record } = await store.createRecipe(slug, {
				name,
				servings,
				...(cooked ? { yield: cooked } : {}),
				units,
				ingredients,
			});
			return {
				slug,
				path,
				recipe: record,
				perServing: amounts(nutrientCatalog, totals, 1 / servings),
				...(cooked
					? {
							perHundred: {
								unit: cooked.baseUnit,
								nutrients: amounts(
									nutrientCatalog,
									totals,
									100 / cooked.amount,
								),
							},
						}
					: {}),
			};
		},
	};
}

function parseYield(input: RecipeAddInput): RecipeVersion["yield"] {
	if ((input.baseUnit === undefined) !== (input.yield === undefined)) {
		throw new NomnomError("--yield and --base-unit must be given together");
	}
	if (input.baseUnit === undefined || input.yield === undefined)
		return undefined;
	const baseUnit = normaliseUnitName(input.baseUnit);
	if (baseUnit === SERVING) {
		throw new NomnomError(
			`'${SERVING}' is reserved and can't be the base unit`,
		);
	}
	return { baseUnit, amount: parseNumber(input.yield, "'yield'", "positive") };
}

function amounts(
	catalog: readonly Nutrient[],
	totals: Nutrients,
	scale: number,
): NutrientAmount[] {
	return catalog.map(({ id, name, unit }) => ({
		id,
		name,
		unit,
		value: (totals.get(id) ?? 0) * scale,
	}));
}
