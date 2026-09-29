import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { foodInput, foodOptions } from "./food-options";

export const foodAdd = defineCommand({
	name: ["food", "add"],
	summary: "Add a food",
	options: foodOptions,
	run: async (
		{ values },
		{ services, io }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const added = await services.foods.add(foodInput(values));
		io.stdout(`Created ${added.path}\n`);
	},
});
