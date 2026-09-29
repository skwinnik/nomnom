import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatItems } from "./format";

export const recipeList = defineCommand({
	name: ["recipe", "list"],
	summary: "List every recipe that is not archived",
	run: async (
		_args,
		{ services, io }: CommandEnv<Pick<Services, "recipes">>,
	) => {
		const recipes = await services.recipes.list();
		io.stdout(recipes.length === 0 ? "No recipes\n" : formatItems(recipes));
	},
});
