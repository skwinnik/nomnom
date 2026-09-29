import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { foodInput, foodOptions } from "./food-options";
import { formatChanges, formatUpdated } from "./format";

export const foodUpdate = defineCommand({
	name: ["food", "update"],
	summary: "Add a new version of a food",
	positionals: [
		{
			name: "slug",
			description:
				"The food to update; a new name or first barcode moves it to a new file and archives this one",
		},
	],
	options: foodOptions,
	writes: true,
	run: async (
		{ values, positionals },
		{ services, io, dryRun }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [slug = ""] = positionals;
		const updated = await services.foods.update(slug, foodInput(values));
		io.stdout(
			formatUpdated(
				updated.path,
				updated.food.version,
				updated.archived && {
					path: updated.archived.path,
					version: updated.archived.food.version,
				},
				dryRun,
			) + formatChanges(updated.changes),
		);
	},
});
