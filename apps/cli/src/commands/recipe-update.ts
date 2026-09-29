import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatChanges, formatRecipeNutrients, formatUpdated } from "./format";
import { recipeInput, recipeOptions } from "./recipe-options";

export const recipeUpdate = defineCommand({
	name: ["recipe", "update"],
	summary: "Add a new version of a recipe",
	positionals: [
		{
			name: "slug",
			description:
				"The recipe to update; a new name moves it to a new file and archives this one",
		},
	],
	options: recipeOptions,
	writes: true,
	run: async (
		{ values, positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [slug = ""] = positionals;
		const updated = await services.recipes.update(slug, recipeInput(values));
		const header =
			formatUpdated(
				updated.path,
				updated.recipe.version,
				updated.archived && {
					path: updated.archived.path,
					version: updated.archived.recipe.version,
				},
				dryRun,
			) + formatChanges(updated.changes);
		io.stdout([header, ...formatRecipeNutrients(updated)].join("\n"));
	},
});
