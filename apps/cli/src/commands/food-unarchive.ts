import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatArchived } from "./format";

export const foodUnarchive = defineCommand({
	name: ["food", "unarchive"],
	summary: "Unarchive a food",
	positionals: [{ name: "slug", description: "The food to unarchive" }],
	writes: true,
	run: async (
		{ positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [slug = ""] = positionals;
		const { path, food } = await services.foods.unarchive(slug);
		io.stdout(formatArchived(path, food.version, { archived: false, dryRun }));
	},
});
