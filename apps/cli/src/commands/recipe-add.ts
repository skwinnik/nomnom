import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatRecipeNutrients, writeVerb } from "./format";
import { recipeInput, recipeOptions } from "./recipe-options";

export const recipeAdd = defineCommand({
	name: ["recipe", "add"],
	summary: "Add a recipe",
	options: recipeOptions,
	writes: true,
	run: async (
		{ values },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const added = await services.recipes.add(recipeInput(values));
		io.stdout(
			[
				`${writeVerb("Created", dryRun)} ${added.path}\n`,
				...formatRecipeNutrients(added),
			].join("\n"),
		);
	},
});
