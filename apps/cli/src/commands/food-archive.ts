import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatArchived } from "./format";

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
	writes: true,
	run: async (
		{ positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [slug = ""] = positionals;
		const { path, food } = await services.foods.archive(slug);
		io.stdout(formatArchived(path, food.version, { archived: true, dryRun }));
	},
});
