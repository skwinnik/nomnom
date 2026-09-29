import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatColumns, formatItems, formatNutrients } from "./format";

export const recipeShow = defineCommand({
	name: ["recipe", "show"],
	summary: "Show one version of a recipe and its nutrients",
	positionals: [
		{
			name: "recipe",
			description:
				"A recipe, optionally with a version (pancakes@1); default: the latest version",
		},
	],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [ref = ""] = positionals;
		const shown = await services.recipes.show(ref);
		const { recipe } = shown;
		const cooked = recipe.yield;
		const lines = [
			formatItems([
				{
					kind: "recipe",
					slug: shown.slug,
					version: recipe.version,
					name: recipe.name,
				},
			]),
			`Created: ${recipe.created}\n`,
		];
		if (recipe.version !== shown.latestVersion) {
			lines.push(`Latest version: ${shown.latestVersion}\n`);
		}
		if (shown.archived) lines.push("Archived: yes\n");
		lines.push(`Servings: ${recipe.servings}\n`);
		if (cooked) lines.push(`Yield: ${cooked.amount} ${cooked.baseUnit}\n`);
		lines.push(
			"Units:\n",
			formatColumns(
				shown.units.map(({ name, size }) => {
					if (!cooked || size === undefined) return [name];
					if (name === cooked.baseUnit) return [name, "base unit"];
					return [name, `${formatSize(size)} ${cooked.baseUnit}`];
				}),
				"  ",
			),
			"Ingredients:\n",
			formatColumns(
				recipe.ingredients.map((ingredient) => [
					`${ingredient.slug}@${ingredient.version}`,
					`${ingredient.amount} ${ingredient.unit}`,
				]),
				"  ",
			),
			formatNutrients("Per serving", shown.perServing),
		);
		if (shown.perHundred) {
			lines.push(
				formatNutrients(
					`Per 100 ${shown.perHundred.unit}`,
					shown.perHundred.nutrients,
				),
			);
		}
		io.stdout(lines.join(""));
	},
});

/** A unit size, which may be calculated (a serving is yield / servings), to at most one decimal place. */
function formatSize(size: number): string {
	return String(Math.round(size * 10) / 10);
}
