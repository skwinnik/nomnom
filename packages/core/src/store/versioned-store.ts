import { join } from "node:path";
import type { Clock } from "../clock/clock";
import type { DataPaths } from "../data-dir/paths";
import { NomnomError, type Problem } from "../errors";
import { FileExistsError, type FileSystem } from "../fs/file-system";
import { compareSlugs, isSlug } from "../shared/slug";
import { localTimestamp } from "../shared/time";
import { parseFoodFile, parseRecipeFile } from "./parse";
import type {
	FoodVersion,
	NewFoodVersion,
	NewRecipeVersion,
	RecipeVersion,
} from "./records";
import { serialiseFood, serialiseRecipe } from "./write";

export interface Written<T> {
	/** The path of the written file. */
	path: string;
	record: T;
}

/** The fields of a version to append; the store numbers and timestamps it. */
export type AppendedFood = NewFoodVersion & { readonly archived?: boolean };
export type AppendedRecipe = NewRecipeVersion & { readonly archived?: boolean };

/** The `*.yaml` files of a directory, sorted into slugs and invalid names. */
export interface Scan {
	/** The slug of every file whose name is a slug, in code point order. */
	slugs: string[];
	/** One problem per file whose name is not a slug, in name order. */
	invalid: Problem[];
}

/** Reads, creates and extends the versioned YAML files of foods and recipes. */
export interface VersionedStore {
	/**
	 * Every `*.yaml` file in `foods/`, by slug or as an invalid name. Other
	 * files and directories are ignored.
	 */
	scanFoods(): Promise<Scan>;
	/** Every `*.yaml` file in `recipes/`, as for `scanFoods`. */
	scanRecipes(): Promise<Scan>;
	/**
	 * The slugs of `scanFoods`. Throws one `NomnomError` carrying every invalid
	 * file name.
	 */
	foodSlugs(): Promise<string[]>;
	/** The slugs of `scanRecipes`, as for `foodSlugs`. */
	recipeSlugs(): Promise<string[]>;
	/** Every version of a food, or `undefined` when it has no file. */
	readFood(slug: string): Promise<FoodVersion[] | undefined>;
	/** Every version of a recipe, or `undefined` when it has no file. */
	readRecipe(slug: string): Promise<RecipeVersion[] | undefined>;
	/** Writes a new food file holding version 1. Never overwrites a file. */
	createFood(slug: string, food: NewFoodVersion): Promise<Written<FoodVersion>>;
	/** Writes a new recipe file holding version 1. Never overwrites a file. */
	createRecipe(
		slug: string,
		recipe: NewRecipeVersion,
	): Promise<Written<RecipeVersion>>;
	/**
	 * Adds a version after the latest one in an existing food file, numbered by
	 * the file. The existing text is kept byte for byte. Throws `NomnomError`
	 * when the file is missing or invalid, without writing.
	 */
	appendFood(slug: string, food: AppendedFood): Promise<Written<FoodVersion>>;
	/** Adds a version to an existing recipe file, as for `appendFood`. */
	appendRecipe(
		slug: string,
		recipe: AppendedRecipe,
	): Promise<Written<RecipeVersion>>;
}

export function createVersionedStore(deps: {
	fs: FileSystem;
	clock: Clock;
	paths: DataPaths;
}): VersionedStore {
	const { fs, clock, paths } = deps;

	const read = async <T>(
		path: string,
		parse: (text: string, file: string) => T[],
	): Promise<T[] | undefined> => {
		const text = await fs.readText(path);
		return text === undefined ? undefined : parse(text, path);
	};

	const scan = async (dir: string): Promise<Scan> => {
		const slugs: string[] = [];
		const invalid: Problem[] = [];
		for (const entry of await fs.list(dir)) {
			if (entry.kind !== "file" || !entry.name.endsWith(".yaml")) continue;
			const slug = entry.name.slice(0, -".yaml".length);
			if (isSlug(slug)) {
				slugs.push(slug);
			} else {
				invalid.push({
					file: join(dir, entry.name),
					message: `'${slug}' is not a valid file name: use letters, digits and '-'`,
				});
			}
		}
		// Sorted again: `a-b.yaml` sorts before `a.yaml`, but `a` before `a-b`.
		return { slugs: slugs.sort(compareSlugs), invalid };
	};

	const slugs = async (dir: string): Promise<string[]> => {
		const { slugs, invalid } = await scan(dir);
		const [only] = invalid;
		if (only) {
			throw new NomnomError(
				invalid.length === 1
					? `${only.file} is invalid`
					: `${invalid.length} files in ${dir} are invalid`,
				invalid,
			);
		}
		return slugs;
	};

	const create = async <T>(
		slug: string,
		path: string,
		record: T,
		serialise: (record: T) => string,
	): Promise<Written<T>> => {
		try {
			await fs.createExclusive(path, serialise(record));
		} catch (error) {
			if (error instanceof FileExistsError) {
				throw new NomnomError(`'${slug}' already exists: ${path}`);
			}
			throw error;
		}
		return { path, record };
	};

	const append = async <T extends { version: number }>(
		kind: string,
		slug: string,
		path: string,
		fields: Omit<T, "version" | "created" | "archived"> & {
			readonly archived?: boolean;
		},
		parse: (text: string, file: string) => T[],
		serialise: (record: T) => string,
	): Promise<Written<T>> => {
		const text = await fs.readText(path);
		if (text === undefined) {
			throw new NomnomError(`There is no ${kind} '${slug}': ${path}`);
		}
		const versions = parse(text, path);
		// Built field by field so the caller can't choose the version.
		const record = {
			...fields,
			version: versions.length + 1,
			created: localTimestamp(clock.now()),
			archived: fields.archived ?? false,
		} as unknown as T;
		const separator = text.endsWith("\n") ? "" : "\n";
		await fs.replaceAtomic(path, `${text}${separator}${serialise(record)}`);
		return { path, record };
	};

	const first = () => ({
		version: 1,
		created: localTimestamp(clock.now()),
		archived: false,
	});

	return {
		scanFoods: () => scan(paths.foods),
		scanRecipes: () => scan(paths.recipes),
		foodSlugs: () => slugs(paths.foods),
		recipeSlugs: () => slugs(paths.recipes),
		readFood: (slug) => read(paths.food(slug), parseFoodFile),
		readRecipe: (slug) => read(paths.recipe(slug), parseRecipeFile),
		createFood: (slug, food) =>
			create(slug, paths.food(slug), { ...first(), ...food }, serialiseFood),
		createRecipe: (slug, recipe) =>
			create(
				slug,
				paths.recipe(slug),
				{ ...first(), ...recipe },
				serialiseRecipe,
			),
		appendFood: (slug, food) =>
			append(
				"food",
				slug,
				paths.food(slug),
				food,
				parseFoodFile,
				serialiseFood,
			),
		appendRecipe: (slug, recipe) =>
			append(
				"recipe",
				slug,
				paths.recipe(slug),
				recipe,
				parseRecipeFile,
				serialiseRecipe,
			),
	};
}
