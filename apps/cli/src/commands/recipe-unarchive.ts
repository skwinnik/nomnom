import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatArchived } from "./format";

export const recipeUnarchive = defineCommand({
	name: ["recipe", "unarchive"],
	summary: "Unarchive a recipe",
	positionals: [{ name: "slug", description: "The recipe to unarchive" }],
	writes: true,
	run: async (
		{ positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [slug = ""] = positionals;
		const { path, recipe } = await services.recipes.unarchive(slug);
		io.stdout(
			formatArchived(path, recipe.version, { archived: false, dryRun }),
		);
	},
});
