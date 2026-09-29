import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";

export const recipeUnarchive = defineCommand({
	name: ["recipe", "unarchive"],
	summary: "Unarchive a recipe",
	positionals: [{ name: "slug", description: "The recipe to unarchive" }],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [slug = ""] = positionals;
		const { path, recipe } = await services.recipes.unarchive(slug);
		io.stdout(`Unarchived ${path} (version ${recipe.version})\n`);
	},
});
