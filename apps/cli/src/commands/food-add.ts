import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { nutrientOptions, nutrientValues } from "./nutrients";

export const foodAdd = defineCommand({
	name: ["food", "add"],
	summary: "Add a food",
	options: (ctx) => ({
		name: { type: "string", required: true, description: "Display name" },
		"base-unit": {
			type: "string",
			required: true,
			valueName: "unit",
			description: "Unit that amounts are measured in, such as g or ml",
		},
		per: {
			type: "string",
			default: "100",
			valueName: "number",
			description: "Number of base units the nutrient values refer to",
		},
		units: {
			type: "string",
			multiple: true,
			valueName: "name=amount",
			description:
				"Another unit and its size in base units, as in 'medium apple'=180",
		},
		barcode: {
			type: "string",
			multiple: true,
			valueName: "digits",
			description: "Barcode; the first one becomes part of the file name",
		},
		...nutrientOptions(
			ctx.config,
			(n) => `${n.name} (${n.unit}) per --per base units`,
			{ markRequired: true },
		),
	}),
	run: async (
		{ values },
		{ services, io }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const {
			name,
			"base-unit": baseUnit,
			per,
			units,
			barcode,
			...rest
		} = values;
		const added = await services.foods.add({
			name,
			baseUnit,
			per,
			nutrients: nutrientValues(rest),
			units: units ?? [],
			barcodes: barcode ?? [],
		});
		io.stdout(`Created ${added.path}\n`);
	},
});
