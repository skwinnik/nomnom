import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";

export const foodUnarchive = defineCommand({
	name: ["food", "unarchive"],
	summary: "Unarchive a food",
	positionals: [{ name: "slug", description: "The food to unarchive" }],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [slug = ""] = positionals;
		const { path, food } = await services.foods.unarchive(slug);
		io.stdout(`Unarchived ${path} (version ${food.version})\n`);
	},
});
