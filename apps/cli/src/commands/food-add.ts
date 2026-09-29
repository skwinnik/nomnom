import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { foodInput, foodOptions } from "./food-options";
import { writeVerb } from "./format";

export const foodAdd = defineCommand({
	name: ["food", "add"],
	summary: "Add a food",
	options: foodOptions,
	writes: true,
	run: async (
		{ values },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const added = await services.foods.add(foodInput(values));
		io.stdout(`${writeVerb("Created", dryRun)} ${added.path}\n`);
	},
});
