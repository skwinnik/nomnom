/** One version of a food, as stored in `foods/<slug>.yaml`. */
export interface FoodVersion {
	readonly version: number;
	/** ISO 8601 timestamp with a UTC offset. */
	readonly created: string;
	readonly name: string;
	/** Digit strings; the first one is part of the slug. */
	readonly barcodes: readonly string[];
	readonly baseUnit: string;
	/** The number of base units that the nutrient values refer to. */
	readonly per: number;
	/** Only the values that were given, including ids no longer in the catalog. */
	readonly nutrients: ReadonlyMap<string, number>;
	/** Additional units: name to a positive amount of base units. */
	readonly units: ReadonlyMap<string, number>;
	readonly archived: boolean;
}

export type ItemKind = "food" | "recipe";

/** A recipe ingredient: an exact version of a food or recipe, with an amount in one of its units. */
export interface Ingredient {
	readonly kind: ItemKind;
	readonly slug: string;
	readonly version: number;
	readonly amount: number;
	readonly unit: string;
}

/** One version of a recipe, as stored in `recipes/<slug>.yaml`. Nutrients are calculated, never stored. */
export interface RecipeVersion {
	readonly version: number;
	readonly created: string;
	readonly name: string;
	readonly servings: number;
	/** The cooked amount: present together or not at all. */
	readonly yield?: { readonly baseUnit: string; readonly amount: number };
	/** Additional units: name to a positive amount of base units. Only with a yield. */
	readonly units: ReadonlyMap<string, number>;
	readonly ingredients: readonly Ingredient[];
	readonly archived: boolean;
}

/** A new food, before it gets a version and a timestamp. */
export type NewFoodVersion = Omit<
	FoodVersion,
	"version" | "created" | "archived"
>;

/** A new recipe, before it gets a version and a timestamp. */
export type NewRecipeVersion = Omit<
	RecipeVersion,
	"version" | "created" | "archived"
>;
