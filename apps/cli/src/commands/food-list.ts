import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatItems } from "./format";

export const foodList = defineCommand({
	name: ["food", "list"],
	summary: "List every food that is not archived",
	run: async (_args, { services, io }: CommandEnv<Pick<Services, "foods">>) => {
		const foods = await services.foods.list();
		io.stdout(foods.length === 0 ? "No foods\n" : formatItems(foods));
	},
});
