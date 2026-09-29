import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatNutrients } from "./format";

export const recipeAdd = defineCommand({
	name: ["recipe", "add"],
	summary: "Add a recipe",
	options: {
		name: { type: "string", required: true, description: "Display name" },
		ingredient: {
			type: "string",
			multiple: true,
			valueName: "ref=amount [unit]",
			description:
				"A food or recipe, as in carrot=2 medium carrot or stock@1=500 g; without a version the latest is pinned, without a unit its default unit is used",
		},
		servings: {
			type: "string",
			default: "1",
			valueName: "number",
			description: "Number of servings the recipe makes",
		},
		"base-unit": {
			type: "string",
			valueName: "unit",
			description: "Unit of the cooked amount; give together with --yield",
		},
		yield: {
			type: "string",
			valueName: "number",
			description:
				"Cooked amount in base units; give together with --base-unit",
		},
		units: {
			type: "string",
			multiple: true,
			valueName: "name=amount",
			description: "Another unit and its size in base units; needs --yield",
		},
	},
	run: async (
		{ values },
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const added = await services.recipes.add({
			name: values.name,
			ingredients: values.ingredient ?? [],
			servings: values.servings,
			...(values["base-unit"] === undefined
				? {}
				: { baseUnit: values["base-unit"] }),
			...(values.yield === undefined ? {} : { yield: values.yield }),
			units: values.units ?? [],
		});
		const sections = [
			`Created ${added.path}\n`,
			formatNutrients("Per serving", added.perServing),
		];
		if (added.perHundred) {
			sections.push(
				formatNutrients(
					`Per 100 ${added.perHundred.unit}`,
					added.perHundred.nutrients,
				),
			);
		}
		io.stdout(sections.join("\n"));
	},
});
