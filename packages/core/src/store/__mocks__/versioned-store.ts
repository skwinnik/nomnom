import { dataPaths } from "../../data-dir/paths";
import { NomnomError } from "../../errors";
import { compareSlugs } from "../../shared/slug";
import { parseFoodFile, parseRecipeFile } from "../parse";
import type {
	FoodVersion,
	NewFoodVersion,
	NewRecipeVersion,
	RecipeVersion,
} from "../records";
import type { VersionedStore, Written } from "../versioned-store";

const paths = dataPaths("/data");
const created = "2026-09-01T08:00:00+03:00";

export interface FakeStore extends VersionedStore {
	readonly foods: Map<string, FoodVersion[]>;
	readonly recipes: Map<string, RecipeVersion[]>;
}

/**
 * An in-memory store of already-parsed versions, for services tested without
 * YAML. `food` and `recipe` build fixtures with sensible defaults.
 */
export function createFakeStore(
	items: {
		foods?: Record<string, FoodVersion[]>;
		recipes?: Record<string, RecipeVersion[]>;
	} = {},
): FakeStore {
	const foods = new Map(Object.entries(items.foods ?? {}));
	const recipes = new Map(Object.entries(items.recipes ?? {}));
	const add = <T>(
		map: Map<string, T[]>,
		slug: string,
		path: string,
		record: T,
	): Written<T> => {
		if (map.has(slug))
			throw new NomnomError(`'${slug}' already exists: ${path}`);
		map.set(slug, [record]);
		return { path, record };
	};
	const append = <T extends { version: number }>(
		map: Map<string, T[]>,
		kind: string,
		slug: string,
		path: string,
		fields: Omit<T, "version" | "created" | "archived"> & {
			archived?: boolean;
		},
	): Written<T> => {
		const versions = map.get(slug);
		if (!versions)
			throw new NomnomError(`There is no ${kind} '${slug}': ${path}`);
		const record = {
			...fields,
			version: versions.length + 1,
			created,
			archived: fields.archived ?? false,
		} as unknown as T;
		versions.push(record);
		return { path, record };
	};
	return {
		foods,
		recipes,
		foodSlugs: async () => [...foods.keys()].sort(compareSlugs),
		recipeSlugs: async () => [...recipes.keys()].sort(compareSlugs),
		readFood: async (slug) => foods.get(slug),
		readRecipe: async (slug) => recipes.get(slug),
		createFood: async (slug, food) =>
			add(foods, slug, paths.food(slug), {
				...food,
				version: 1,
				created,
				archived: false,
			}),
		createRecipe: async (slug, recipe) =>
			add(recipes, slug, paths.recipe(slug), {
				...recipe,
				version: 1,
				created,
				archived: false,
			}),
		appendFood: async (slug, food) =>
			append(foods, "food", slug, paths.food(slug), food),
		appendRecipe: async (slug, recipe) =>
			append(recipes, "recipe", slug, paths.recipe(slug), recipe),
	};
}

/** A food version with defaults: per 100 g, no barcodes or units. */
export function food(
	fields: Partial<Omit<NewFoodVersion, "nutrients" | "units">> & {
		nutrients?: Record<string, number>;
		units?: Record<string, number>;
		version?: number;
		archived?: boolean;
	} = {},
): FoodVersion {
	return {
		version: fields.version ?? 1,
		created,
		name: fields.name ?? "Food",
		barcodes: fields.barcodes ?? [],
		baseUnit: fields.baseUnit ?? "g",
		per: fields.per ?? 100,
		nutrients: new Map(Object.entries(fields.nutrients ?? {})),
		units: new Map(Object.entries(fields.units ?? {})),
		archived: fields.archived ?? false,
	};
}

/** A recipe version with defaults: one serving, no yield. */
export function recipe(
	fields: Partial<Omit<NewRecipeVersion, "units">> & {
		units?: Record<string, number>;
		version?: number;
		archived?: boolean;
	} = {},
): RecipeVersion {
	return {
		version: fields.version ?? 1,
		created,
		name: fields.name ?? "Recipe",
		servings: fields.servings ?? 1,
		...(fields.yield ? { yield: fields.yield } : {}),
		units: new Map(Object.entries(fields.units ?? {})),
		ingredients: fields.ingredients ?? [],
		archived: fields.archived ?? false,
	};
}

/** Parses hand-written YAML fixtures, as the real store would. */
export function parsedFood(text: string): FoodVersion[] {
	return parseFoodFile(text, "/data/foods/fixture.yaml");
}

export function parsedRecipe(text: string): RecipeVersion[] {
	return parseRecipeFile(text, "/data/recipes/fixture.yaml");
}
