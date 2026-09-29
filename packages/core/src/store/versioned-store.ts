import { join } from "node:path";
import type { Clock } from "../clock/clock";
import type { DataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
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

export interface Created<T> {
	/** The path of the created file. */
	path: string;
	record: T;
}

/** Reads and creates the versioned YAML files of foods and recipes. */
export interface VersionedStore {
	/**
	 * The slug of every `*.yaml` file in `foods/`, in code point order. Other
	 * files and directories are ignored; a file name that is not a slug throws.
	 */
	foodSlugs(): Promise<string[]>;
	/** The slug of every `*.yaml` file in `recipes/`, as for `foodSlugs`. */
	recipeSlugs(): Promise<string[]>;
	/** Every version of a food, or `undefined` when it has no file. */
	readFood(slug: string): Promise<FoodVersion[] | undefined>;
	/** Every version of a recipe, or `undefined` when it has no file. */
	readRecipe(slug: string): Promise<RecipeVersion[] | undefined>;
	/** Writes a new food file holding version 1. Never overwrites a file. */
	createFood(slug: string, food: NewFoodVersion): Promise<Created<FoodVersion>>;
	/** Writes a new recipe file holding version 1. Never overwrites a file. */
	createRecipe(
		slug: string,
		recipe: NewRecipeVersion,
	): Promise<Created<RecipeVersion>>;
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

	const slugs = async (dir: string): Promise<string[]> => {
		const result: string[] = [];
		for (const entry of await fs.list(dir)) {
			if (entry.kind !== "file" || !entry.name.endsWith(".yaml")) continue;
			const slug = entry.name.slice(0, -".yaml".length);
			if (!isSlug(slug)) {
				const file = join(dir, entry.name);
				throw new NomnomError(`${file} is invalid`, [
					{
						file,
						message: `'${slug}' is not a valid file name: use letters, digits and '-'`,
					},
				]);
			}
			result.push(slug);
		}
		// Sorted again: `a-b.yaml` sorts before `a.yaml`, but `a` before `a-b`.
		return result.sort(compareSlugs);
	};

	const create = async <T>(
		slug: string,
		path: string,
		record: T,
		serialise: (record: T) => string,
	): Promise<Created<T>> => {
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

	const first = () => ({
		version: 1,
		created: localTimestamp(clock.now()),
		archived: false,
	});

	return {
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
	};
}
