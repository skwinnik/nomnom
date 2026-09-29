import type {
	FoodVersion,
	Ingredient,
	NewFoodVersion,
	NewRecipeVersion,
	RecipeVersion,
} from "./records";

/**
 * One difference between two versions, with values already turned into text.
 *
 * - `changed`: a scalar field, or an entry of a map field (`key` set), whose
 *   value differs; `undefined` means absent.
 * - `added` / `removed`: an item of a list field, compared as a multiset.
 * - `reordered`: a list field with the same items in another order.
 */
export type VersionChange =
	| {
			readonly kind: "changed";
			readonly field: string;
			/** The nutrient id or unit name, for an entry of a map field. */
			readonly key?: string;
			readonly before?: string;
			readonly after?: string;
	  }
	| {
			readonly kind: "added" | "removed";
			readonly field: string;
			readonly item: string;
	  }
	| { readonly kind: "reordered"; readonly field: string };

type FoodFields = FoodVersion | NewFoodVersion;
type RecipeFields = RecipeVersion | NewRecipeVersion;

/**
 * What changed from one food version to the next: the name, base unit, `per`,
 * each nutrient, each unit and the barcodes. `version`, `created` and
 * `archived` are never compared. Empty when the versions are identical.
 */
export function diffFood(
	before: FoodFields,
	after: FoodFields,
): VersionChange[] {
	return [
		...scalar("name", before.name, after.name),
		...scalar("base_unit", before.baseUnit, after.baseUnit),
		...scalar("per", text(before.per), text(after.per)),
		...entries("nutrients", before.nutrients, after.nutrients),
		...entries("units", before.units, after.units),
		...items("barcodes", before.barcodes, after.barcodes),
	];
}

/**
 * What changed from one recipe version to the next: the name, servings, base
 * unit, yield, each unit and the ingredients, each as
 * `<slug>@<version> <amount> <unit>`. `version`, `created` and `archived` are
 * never compared. Empty when the versions are identical.
 */
export function diffRecipe(
	before: RecipeFields,
	after: RecipeFields,
): VersionChange[] {
	return [
		...scalar("name", before.name, after.name),
		...scalar("servings", text(before.servings), text(after.servings)),
		...scalar("base_unit", before.yield?.baseUnit, after.yield?.baseUnit),
		...scalar("yield", text(before.yield?.amount), text(after.yield?.amount)),
		...entries("units", before.units, after.units),
		...items(
			"ingredients",
			before.ingredients.map(ingredientText),
			after.ingredients.map(ingredientText),
		),
	];
}

function ingredientText(ingredient: Ingredient): string {
	return `${ingredient.slug}@${ingredient.version} ${text(ingredient.amount)} ${ingredient.unit}`;
}

/** Numbers as text, as day files write them. */
function text(value: number | undefined): string | undefined {
	return value === undefined ? undefined : String(value);
}

function scalar(
	field: string,
	before: string | undefined,
	after: string | undefined,
): VersionChange[] {
	if (before === after) return [];
	return [
		{
			kind: "changed",
			field,
			...(before === undefined ? {} : { before }),
			...(after === undefined ? {} : { after }),
		},
	];
}

/** Map entries by key, regardless of order: the keys of `before`, then the new ones. */
function entries(
	field: string,
	before: ReadonlyMap<string, number>,
	after: ReadonlyMap<string, number>,
): VersionChange[] {
	const keys = [...new Set([...before.keys(), ...after.keys()])];
	return keys.flatMap((key) =>
		scalar(field, text(before.get(key)), text(after.get(key))).map(
			(change) => ({ ...change, key }),
		),
	);
}

/** List items as a multiset: removed ones, then added ones, or `reordered` when only the order differs. */
function items(
	field: string,
	before: readonly string[],
	after: readonly string[],
): VersionChange[] {
	const removed = without(before, after);
	const added = without(after, before);
	if (removed.length === 0 && added.length === 0) {
		const same = before.every((item, i) => item === after[i]);
		return same ? [] : [{ kind: "reordered", field }];
	}
	return [
		...removed.map((item) => ({ kind: "removed" as const, field, item })),
		...added.map((item) => ({ kind: "added" as const, field, item })),
	];
}

/** The items of `list` left after taking out one match for each item of `other`. */
function without(list: readonly string[], other: readonly string[]): string[] {
	const rest = [...other];
	return list.filter((item) => {
		const at = rest.indexOf(item);
		if (at < 0) return true;
		rest.splice(at, 1);
		return false;
	});
}
