import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";

export const foodArchive = defineCommand({
	name: ["food", "archive"],
	summary: "Archive a food",
	positionals: [
		{
			name: "slug",
			description:
				"The food to archive; new references to it are rejected afterwards",
		},
	],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [slug = ""] = positionals;
		const { path, food } = await services.foods.archive(slug);
		io.stdout(`Archived ${path} (version ${food.version})\n`);
	},
});
