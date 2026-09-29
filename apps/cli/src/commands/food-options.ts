import type { FoodAddInput } from "@nomnom/core";
import type { CommandContext, OptionSpecs, OptionValues } from "../runner";
import { nutrientOptions, nutrientValues } from "./nutrients";

/** The options of `food add`, which `food update` takes too. */
export const foodOptions = (ctx: CommandContext) =>
	({
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
	}) as const satisfies OptionSpecs;

/** The service input for parsed `foodOptions` values. */
export function foodInput(
	values: OptionValues<ReturnType<typeof foodOptions>>,
): FoodAddInput {
	const { name, "base-unit": baseUnit, per, units, barcode, ...rest } = values;
	return {
		name,
		baseUnit,
		per,
		nutrients: nutrientValues(rest),
		units: units ?? [],
		barcodes: barcode ?? [],
	};
}
