import { NomnomError } from "../errors";
import { settleInOrder } from "../shared/promises";
import type { ItemRef } from "../shared/references";
import { compareSlugs } from "../shared/slug";
import type { FoodVersion, ItemKind, RecipeVersion } from "../store/records";
import type { VersionedStore } from "../store/versioned-store";
import type { ItemVersion } from "./units";

/** Every version of one food or recipe. */
export type CatalogItem =
	| {
			readonly kind: "food";
			readonly slug: string;
			readonly versions: readonly FoodVersion[];
	  }
	| {
			readonly kind: "recipe";
			readonly slug: string;
			readonly versions: readonly RecipeVersion[];
	  };

/** One line of a list or of search results: an item by its latest version. */
export interface ItemSummary {
	readonly kind: ItemKind;
	readonly slug: string;
	/** The latest version. */
	readonly version: number;
	/** The name of the latest version. */
	readonly name: string;
}

export interface ResolveOptions {
	/**
	 * The reference is being newly written, so an archived item is rejected.
	 * Existing pinned references resolve regardless.
	 */
	newReference?: boolean;
}

/** Foods and recipes as one namespace of slugs. */
export interface Catalog {
	/** The food or recipe with this slug, or `undefined` when neither exists. */
	find(slug: string): Promise<CatalogItem | undefined>;
	/**
	 * Every food and recipe, in slug order. Throws `NomnomError` when any file is
	 * invalid or a slug is both a food and a recipe.
	 */
	all(): Promise<CatalogItem[]>;
	/**
	 * A specific version, or the latest one when the reference has none. Throws
	 * `NomnomError` for an unknown slug or version, and for an archived item
	 * when `newReference` is set.
	 */
	resolve(ref: ItemRef, options?: ResolveOptions): Promise<ItemVersion>;
	/** Throws `NomnomError` when a food or recipe already uses the slug. */
	ensureSlugFree(slug: string): Promise<void>;
}

/** Whether the item is archived: its latest version has `archived: true`. */
export function isArchived(item: CatalogItem): boolean {
	return item.versions.at(-1)?.archived === true;
}

export function createCatalog(deps: { store: VersionedStore }): Catalog {
	const { store } = deps;
	const found = new Map<string, Promise<CatalogItem | undefined>>();

	const load = async (slug: string): Promise<CatalogItem | undefined> => {
		const [food, recipe] = await Promise.all([
			store.readFood(slug),
			store.readRecipe(slug),
		]);
		if (food && recipe) {
			throw new NomnomError(
				`'${slug}' is both a food and a recipe: rename one of the files in foods/ and recipes/`,
			);
		}
		if (food) return { kind: "food", slug, versions: food };
		if (recipe) return { kind: "recipe", slug, versions: recipe };
		return undefined;
	};

	const find = (slug: string) => {
		let item = found.get(slug);
		if (!item) {
			item = load(slug);
			found.set(slug, item);
		}
		return item;
	};

	return {
		find,

		async all() {
			const [foods, recipes] = await Promise.all([
				store.foodSlugs(),
				store.recipeSlugs(),
			]);
			const slugs = [...new Set([...foods, ...recipes])].sort(compareSlugs);
			const items = await settleInOrder(slugs.map(find));
			return items.filter((item) => item !== undefined);
		},

		async resolve(ref, options = {}) {
			const item = await find(ref.slug);
			if (!item) {
				throw new NomnomError(`'${ref.slug}' is neither a food nor a recipe`);
			}
			if (options.newReference && isArchived(item)) {
				throw new NomnomError(
					`'${ref.slug}' is archived and can't be newly referenced`,
				);
			}
			return item.kind === "food"
				? {
						kind: "food",
						slug: item.slug,
						record: pickVersion(item, ref.version),
					}
				: {
						kind: "recipe",
						slug: item.slug,
						record: pickVersion(item, ref.version),
					};
		},

		async ensureSlugFree(slug) {
			const item = await find(slug);
			if (!item) return;
			throw new NomnomError(
				`'${slug}' already exists: it is already used by a ${item.kind}${isArchived(item) ? " (archived)" : ""}`,
			);
		},
	};
}

/** Summarises an item by its latest version, as lists and search print it. */
export function summarise(item: CatalogItem): ItemSummary {
	const latest = item.versions.at(-1);
	return {
		kind: item.kind,
		slug: item.slug,
		version: item.versions.length,
		name: latest?.name ?? "",
	};
}

/**
 * The given version of an item, or its latest one when none is given. Throws
 * `NomnomError` naming the reference when the version does not exist.
 */
export function pickVersion<T>(
	item: {
		readonly kind: ItemKind;
		readonly slug: string;
		readonly versions: readonly T[];
	},
	version = item.versions.length,
): T {
	const record = item.versions[version - 1];
	if (record) return record;
	throw new NomnomError(
		`'${item.slug}@${version}' does not exist: ${item.kind} '${item.slug}' has ${describeVersions(item.versions.length)}`,
	);
}

function describeVersions(count: number): string {
	return count === 1 ? "only version 1" : `versions 1 to ${count}`;
}
