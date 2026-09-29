import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";

export const recipeArchive = defineCommand({
	name: ["recipe", "archive"],
	summary: "Archive a recipe",
	positionals: [
		{
			name: "slug",
			description:
				"The recipe to archive; new references to it are rejected afterwards",
		},
	],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [slug = ""] = positionals;
		const { path, recipe } = await services.recipes.archive(slug);
		io.stdout(`Archived ${path} (version ${recipe.version})\n`);
	},
});
