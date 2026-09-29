import {
	type Catalog,
	type CatalogItem,
	findOfKind,
	type ItemSummary,
	isArchived,
	latestOf,
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
import { diffRecipe, type VersionChange } from "../store/diff";
import type {
	Ingredient,
	NewRecipeVersion,
	RecipeVersion,
} from "../store/records";
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

/** The calculated nutrients of a recipe version. */
export interface RecipeNutrients {
	/** Every catalog nutrient, in catalog order. */
	perServing: NutrientAmount[];
	/** Present when the recipe has a yield: nutrients in 100 base units. */
	perHundred?: { unit: string; nutrients: NutrientAmount[] };
}

export interface RecipeAdded extends RecipeNutrients {
	slug: string;
	/** The path of the created file. */
	path: string;
	recipe: RecipeVersion;
}

/** A recipe version written by `update`, what changed and its nutrients. */
export interface RecipeUpdated extends RecipeNutrients {
	/** The slug of the written version: the old one, or a new one after a rename. */
	slug: string;
	/** The path of the file the version was added to, or of the created file. */
	path: string;
	recipe: RecipeVersion;
	/** Present when the update renamed the recipe: the archiving version of the old one. */
	archived?: RecipeArchived;
	/** Every difference from the latest version of the old recipe. */
	changes: VersionChange[];
}

/** The version `archive` or `unarchive` added. */
export interface RecipeArchived {
	slug: string;
	path: string;
	recipe: RecipeVersion;
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
	/**
	 * Validates a recipe as `add` does and writes it as the next version of the
	 * recipe `slug`. When the name gives another slug, it creates that file
	 * instead and archives the old recipe. Writes nothing when anything fails,
	 * the recipe is archived or nothing changed.
	 */
	update(slug: string, input: RecipeAddInput): Promise<RecipeUpdated>;
	/** Adds a copy of the latest version, pins included, with `archived: true`. */
	archive(slug: string): Promise<RecipeArchived>;
	/** Adds a copy of the latest version, pins included, without `archived`. */
	unarchive(slug: string): Promise<RecipeArchived>;
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

	const pin = async (text: string, self?: string): Promise<Ingredient> => {
		const ref = parseAmountRef(text);
		if (ref.slug === self) {
			throw new NomnomError(
				`A recipe can't contain itself: '${text}' references '${self}'`,
			);
		}
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

	/**
	 * Validates a recipe as typed, pins its ingredients as new references,
	 * derives its slug and calculates its nutrients, as `add` and `update` do.
	 * An ingredient may not reference `self`, the recipe being updated.
	 */
	const prepare = async (
		input: RecipeAddInput,
		self?: string,
	): Promise<{
		slug: string;
		recipe: NewRecipeVersion;
		nutrients: RecipeNutrients;
	}> => {
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
		for (const text of input.ingredients) {
			ingredients.push(await pin(text, self));
		}

		const slug = slugify(name);
		const totals = await nutrition.sumOf(ingredients);
		return {
			slug,
			recipe: {
				name,
				servings,
				...(cooked ? { yield: cooked } : {}),
				units,
				ingredients,
			},
			nutrients: {
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
			},
		};
	};

	/** Adds a copy of the latest version with `archived` set as given, keeping its pins as they are. */
	const setArchived = async (
		item: RecipeItem,
		archived: boolean,
	): Promise<RecipeArchived> => {
		const { path, record } = await store.appendRecipe(item.slug, {
			...latestOf(item),
			archived,
		});
		return { slug: item.slug, path, recipe: record };
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
			const prepared = await prepare(input);
			await catalog.ensureSlugFree(prepared.slug);
			const { path, record } = await store.createRecipe(
				prepared.slug,
				prepared.recipe,
			);
			return {
				slug: prepared.slug,
				path,
				recipe: record,
				...prepared.nutrients,
			};
		},

		async update(slug, input) {
			const item = await findOfKind(catalog, slug, "recipe");
			if (isArchived(item)) {
				throw new NomnomError(
					`'${slug}' is archived and must be unarchived first`,
				);
			}
			const prepared = await prepare(input, slug);
			const latest = latestOf(item);
			const changes = diffRecipe(latest, prepared.recipe);
			if (prepared.slug === slug) {
				if (changes.length === 0) {
					throw new NomnomError(
						`Nothing changed: the values are those of ${slug}@${latest.version}`,
					);
				}
				const { path, record } = await store.appendRecipe(
					slug,
					prepared.recipe,
				);
				return { slug, path, recipe: record, changes, ...prepared.nutrients };
			}

			await catalog.ensureSlugFree(prepared.slug);
			const created = await store.createRecipe(prepared.slug, prepared.recipe);
			const archived = await setArchived(item, true);
			return {
				slug: prepared.slug,
				path: created.path,
				recipe: created.record,
				archived,
				changes,
				...prepared.nutrients,
			};
		},

		async archive(slug) {
			const item = await findOfKind(catalog, slug, "recipe");
			if (isArchived(item)) {
				throw new NomnomError(`'${slug}' is already archived`);
			}
			return setArchived(item, true);
		},

		async unarchive(slug) {
			const item = await findOfKind(catalog, slug, "recipe");
			if (!isArchived(item)) {
				throw new NomnomError(`'${slug}' is not archived`);
			}
			return setArchived(item, false);
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
