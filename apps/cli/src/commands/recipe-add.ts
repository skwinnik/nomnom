import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatRecipeNutrients } from "./format";
import { recipeInput, recipeOptions } from "./recipe-options";

export const recipeAdd = defineCommand({
	name: ["recipe", "add"],
	summary: "Add a recipe",
	options: recipeOptions,
	run: async (
		{ values },
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const added = await services.recipes.add(recipeInput(values));
		io.stdout(
			[`Created ${added.path}\n`, ...formatRecipeNutrients(added)].join("\n"),
		);
	},
});
