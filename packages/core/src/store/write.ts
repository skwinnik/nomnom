import { Document, Scalar } from "yaml";
import type { FoodVersion, RecipeVersion } from "./records";

/** Serialises one food version as a YAML document starting with `---`. */
export function serialiseFood(food: FoodVersion): string {
	const fields = new Map<string, unknown>([
		["version", food.version],
		["created", food.created],
		["name", food.name],
	]);
	if (food.barcodes.length > 0) {
		// Quoted so they read back as text, keeping leading zeros.
		fields.set("barcodes", food.barcodes.map(quoted));
	}
	fields.set("base_unit", food.baseUnit);
	fields.set("per", food.per);
	fields.set("nutrients", new Map(food.nutrients));
	if (food.units.size > 0) fields.set("units", new Map(food.units));
	if (food.archived) fields.set("archived", true);
	return serialise(fields);
}

/** Serialises one recipe version as a YAML document starting with `---`. */
export function serialiseRecipe(recipe: RecipeVersion): string {
	const fields = new Map<string, unknown>([
		["version", recipe.version],
		["created", recipe.created],
		["name", recipe.name],
		["servings", recipe.servings],
	]);
	if (recipe.yield) {
		fields.set("base_unit", recipe.yield.baseUnit);
		fields.set("yield", recipe.yield.amount);
	}
	if (recipe.units.size > 0) fields.set("units", new Map(recipe.units));
	fields.set(
		"ingredients",
		recipe.ingredients.map(
			(ingredient) =>
				new Map<string, unknown>([
					[ingredient.kind, ingredient.slug],
					["version", ingredient.version],
					["amount", ingredient.amount],
					["unit", ingredient.unit],
				]),
		),
	);
	if (recipe.archived) fields.set("archived", true);
	return serialise(fields);
}

function serialise(fields: Map<string, unknown>): string {
	const doc = new Document(fields);
	return `---\n${doc.toString({ lineWidth: 0 })}`;
}

function quoted(text: string): Scalar<string> {
	const scalar = new Scalar(text);
	scalar.type = Scalar.QUOTE_DOUBLE;
	return scalar;
}
