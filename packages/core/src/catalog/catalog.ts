import { NomnomError } from "../errors";
import type { ItemRef } from "../shared/references";
import type { FoodVersion, RecipeVersion } from "../store/records";
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
			const version = ref.version ?? item.versions.length;
			if (item.kind === "food") {
				const record = item.versions[version - 1];
				if (record) return { kind: "food", slug: item.slug, record };
			} else {
				const record = item.versions[version - 1];
				if (record) return { kind: "recipe", slug: item.slug, record };
			}
			throw new NomnomError(
				`'${ref.slug}@${version}' does not exist: ${item.kind} '${ref.slug}' has ${describeVersions(item.versions.length)}`,
			);
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

function describeVersions(count: number): string {
	return count === 1 ? "only version 1" : `versions 1 to ${count}`;
}
