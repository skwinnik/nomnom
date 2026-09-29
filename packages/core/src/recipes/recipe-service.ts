import {
	type Catalog,
	type CatalogItem,
	type ItemSummary,
	isArchived,
	pickVersion,
	summarise,
} from "../catalog/catalog";
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
import { settleInOrder } from "../shared/promises";
import { parseAmountRef, parseItemRef } from "../shared/references";
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

/** A unit a recipe version allows. */
export interface AllowedUnit {
	name: string;
	/** Its size in the recipe's base units; absent without a yield. */
	size?: number;
}

export interface RecipeShown {
	slug: string;
	/** The shown version. */
	recipe: RecipeVersion;
	latestVersion: number;
	/** Whether the recipe is archived: its latest version is. */
	archived: boolean;
	/** Every unit the version allows: with a yield, the base unit, `serving` and its units; otherwise `serving` alone. */
	units: AllowedUnit[];
	/** Every catalog nutrient, in catalog order. */
	perServing: NutrientAmount[];
	/** Present when the version has a yield: nutrients in 100 base units. */
	perHundred?: { unit: string; nutrients: NutrientAmount[] };
}

export interface RecipeService {
	/**
	 * Validates a new recipe, pins its ingredients and calculates its nutrients,
	 * then writes it as version 1. Writes nothing when anything fails.
	 */
	add(input: RecipeAddInput): Promise<RecipeAdded>;
	/** Every non-archived recipe by its latest version, in slug order. */
	list(): Promise<ItemSummary[]>;
	/** One version of a recipe, `<slug>[@<version>]`, with its calculated nutrients. */
	show(ref: string): Promise<RecipeShown>;
}

type RecipeItem = CatalogItem & { kind: "recipe" };

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

	/** Every recipe, in slug order. Fails when any recipe file is invalid. */
	const allRecipes = async (): Promise<RecipeItem[]> => {
		const slugs = await store.recipeSlugs();
		const versions = await settleInOrder(
			slugs.map((slug) => store.readRecipe(slug)),
		);
		return slugs.flatMap((slug, i) => {
			const found = versions[i];
			return found ? [{ kind: "recipe" as const, slug, versions: found }] : [];
		});
	};

	return {
		async list() {
			return (await allRecipes())
				.filter((item) => !isArchived(item))
				.map(summarise);
		},

		async show(text) {
			const ref = parseItemRef(text);
			const versions = await store.readRecipe(ref.slug);
			if (!versions) throw new NomnomError(`There is no recipe '${ref.slug}'`);
			const item: RecipeItem = { kind: "recipe", slug: ref.slug, versions };
			const record = pickVersion(item, ref.version);
			const version = { kind: "recipe" as const, slug: item.slug, record };
			const { nutrients: nutrientCatalog } = await config.load();
			const cooked = record.yield;
			const units = [...measureOf(version).units].map(([name, size]) =>
				cooked ? { name, size } : { name },
			);
			const perServing = await nutrition.amountOf(version, 1, SERVING);
			return {
				slug: item.slug,
				recipe: record,
				latestVersion: versions.length,
				archived: isArchived(item),
				units,
				perServing: amounts(nutrientCatalog, perServing, 1),
				...(cooked
					? {
							perHundred: {
								unit: cooked.baseUnit,
								nutrients: amounts(
									nutrientCatalog,
									await nutrition.amountOf(version, 100, cooked.baseUnit),
									1,
								),
							},
						}
					: {}),
			};
		},

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
