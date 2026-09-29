import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatArchived } from "./format";

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
	writes: true,
	run: async (
		{ positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const [slug = ""] = positionals;
		const { path, recipe } = await services.recipes.archive(slug);
		io.stdout(formatArchived(path, recipe.version, { archived: true, dryRun }));
	},
});
