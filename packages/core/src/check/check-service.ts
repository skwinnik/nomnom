import { basename, dirname } from "node:path";
import { createCatalog, isArchived, latestOf } from "../catalog/catalog";
import { resolveReference, TargetError } from "../catalog/reference";
import type { ConfigService } from "../config/config-service";
import type { DataPaths } from "../data-dir/paths";
import { readDay } from "../daylog/read-day";
import { NomnomError, type Problem } from "../errors";
import { usabilityProblems } from "../foods/usable";
import type { FileSystem } from "../fs/file-system";
import { normaliseBarcode } from "../shared/barcodes";
import { compareSlugs } from "../shared/slug";
import type { FoodVersion, RecipeVersion } from "../store/records";
import type { VersionedStore } from "../store/versioned-store";
import { findCycles } from "./cycles";
import { scanDayFiles } from "./day-files";

export interface CheckResult {
	/**
	 * Problems that make data invalid, grouped by file: `config.yaml`, food
	 * files by slug, recipe files by slug, then files under `logs/` by path.
	 */
	errors: Problem[];
	/** Problems that don't, such as a section for an unknown meal. */
	warnings: Problem[];
	/** The numbers of files checked. */
	checked: { foods: number; recipes: number; days: number };
}

export interface CheckService {
	/**
	 * Checks every file in the data directory, reporting each problem once,
	 * where it lives. Throws the error of `config.yaml` when it is invalid,
	 * without checking anything else. Writes no data file.
	 */
	check(): Promise<CheckResult>;
}

export function createCheckService(deps: {
	fs: FileSystem;
	paths: DataPaths;
	config: ConfigService;
	store: VersionedStore;
}): CheckService {
	const { fs, paths } = deps;

	return {
		async check() {
			const config = await deps.config.load();
			// Each file is parsed once, whether it is checked or referenced.
			const store = cachingStore(deps.store);
			const catalog = createCatalog({ store });
			const errors: Problem[] = [];
			const warnings: Problem[] = [];

			const [foodScan, recipeScan] = await Promise.all([
				store.scanFoods(),
				store.scanRecipes(),
			]);
			errors.push(...foodScan.invalid, ...recipeScan.invalid);
			const foods = await readAll(foodScan.slugs, store.readFood, errors);
			const recipes = await readAll(recipeScan.slugs, store.readRecipe, errors);

			const recipeSlugs = new Set(recipeScan.slugs);
			for (const slug of foodScan.slugs) {
				if (!recipeSlugs.has(slug)) continue;
				errors.push({
					file: paths.food(slug),
					message: `'${slug}' is both a food and a recipe: rename one of the files in foods/ and recipes/`,
				});
			}

			for (const [slug, versions] of foods) {
				for (const version of versions) {
					for (const message of usabilityProblems(version, config.nutrients)) {
						errors.push({
							file: paths.food(slug),
							message: `version ${version.version}: ${message}`,
						});
					}
				}
			}
			errors.push(...sharedBarcodes(foods, paths));

			for (const [slug, versions] of recipes) {
				errors.push(
					...(await checkIngredients(
						slug,
						versions,
						{ catalog, config },
						paths,
					)),
				);
			}
			for (const group of findCycles(recipes)) {
				const [first = ""] = group;
				const at = first.lastIndexOf("@");
				errors.push({
					file: paths.recipe(first.slice(0, at)),
					message: `version ${first.slice(at + 1)}: recipes reference each other in a cycle: ${group.join(", ")}`,
				});
			}

			const days = await scanDayFiles({ fs, paths });
			errors.push(...days.invalid);
			// One day at a time, in date order, so problems come in that order.
			for (const date of days.dates) {
				const { check } = await readDay({ fs, paths, catalog }, config, date, {
					omitTargetProblems: true,
				});
				errors.push(...check.errors);
				warnings.push(...check.warnings);
			}

			return {
				errors: inOutputOrder(errors, paths),
				warnings,
				checked: {
					foods: foodScan.slugs.length,
					recipes: recipeScan.slugs.length,
					days: days.dates.length,
				},
			};
		},
	};
}

/** The store, reading each food and recipe file at most once. */
function cachingStore(store: VersionedStore): VersionedStore {
	const once = <T>(read: (slug: string) => Promise<T>) => {
		const reads = new Map<string, Promise<T>>();
		return (slug: string): Promise<T> => {
			let result = reads.get(slug);
			if (!result) {
				result = read(slug);
				reads.set(slug, result);
			}
			return result;
		};
	};
	return {
		...store,
		readFood: once(store.readFood),
		readRecipe: once(store.readRecipe),
	};
}

/**
 * Reads every file of the slugs, one at a time, in slug order. The versions
 * of each valid file are returned; the problems of each invalid one are
 * added to `errors`.
 */
async function readAll<T>(
	slugs: readonly string[],
	read: (slug: string) => Promise<T[] | undefined>,
	errors: Problem[],
): Promise<Map<string, T[]>> {
	const items = new Map<string, T[]>();
	for (const slug of slugs) {
		try {
			const versions = await read(slug);
			if (versions) items.set(slug, versions);
		} catch (error) {
			if (!(error instanceof NomnomError)) throw error;
			errors.push(...error.problems);
		}
	}
	return items;
}

/**
 * One problem per normalized barcode that the latest versions of several
 * non-archived foods have, at the food whose slug comes first.
 */
function sharedBarcodes(
	foods: ReadonlyMap<string, readonly FoodVersion[]>,
	paths: DataPaths,
): Problem[] {
	const holders = new Map<string, { barcode: string; refs: string[] }>();
	for (const [slug, versions] of foods) {
		const item = { kind: "food" as const, slug, versions };
		if (isArchived(item)) continue;
		const latest = latestOf(item);
		for (const barcode of latest.barcodes) {
			const normalized = normaliseBarcode(barcode);
			const ref = `${slug}@${latest.version}`;
			const holder = holders.get(normalized);
			if (!holder) holders.set(normalized, { barcode, refs: [ref] });
			else if (!holder.refs.includes(ref)) holder.refs.push(ref);
		}
	}
	const problems: Problem[] = [];
	for (const [normalized, { barcode, refs }] of holders) {
		const [first = "", ...others] = refs;
		if (others.length === 0) continue;
		problems.push({
			file: paths.food(first.slice(0, first.lastIndexOf("@"))),
			message: `the barcode '${barcode}' (normalized: ${normalized}) also belongs to ${others.join(", ")}`,
		});
	}
	return problems;
}

/**
 * The problems of every ingredient of every version of a recipe that lie in
 * the ingredient itself. Problems of the items it references are left out:
 * they are reported at those items.
 */
async function checkIngredients(
	slug: string,
	versions: readonly RecipeVersion[],
	deps: Parameters<typeof resolveReference>[0],
	paths: DataPaths,
): Promise<Problem[]> {
	const problems: Problem[] = [];
	for (const version of versions) {
		for (const [i, ingredient] of version.ingredients.entries()) {
			try {
				await resolveReference(deps, ingredient, {
					unit: ingredient.unit,
					kind: ingredient.kind,
				});
			} catch (error) {
				if (!(error instanceof NomnomError)) throw error;
				if (error instanceof TargetError) continue;
				problems.push({
					file: paths.recipe(slug),
					message: `version ${version.version}, ingredient ${i + 1} (${ingredient.slug}@${ingredient.version}): ${error.message}`,
				});
			}
		}
	}
	return problems;
}

/**
 * The problems sorted by file in output order, keeping the order of each
 * file's problems.
 */
function inOutputOrder(
	problems: readonly Problem[],
	paths: DataPaths,
): Problem[] {
	const rank = (file: string): number => {
		if (file === paths.config) return 0;
		if (dirname(file) === paths.foods) return 1;
		if (dirname(file) === paths.recipes) return 2;
		return 3;
	};
	// Food and recipe files by slug: `a.yaml` comes before `a-b.yaml`.
	const key = (file: string): string =>
		rank(file) === 1 || rank(file) === 2
			? basename(file).slice(0, -".yaml".length)
			: file;
	return [...problems].sort(
		(a, b) =>
			rank(a.file) - rank(b.file) || compareSlugs(key(a.file), key(b.file)),
	);
}
