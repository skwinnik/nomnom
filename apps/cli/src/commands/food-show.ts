import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatColumns, formatItems, formatStoredNutrients } from "./format";

export const foodShow = defineCommand({
	name: ["food", "show"],
	summary: "Show one version of a food",
	positionals: [
		{
			name: "food",
			description:
				"A food, optionally with a version (apple@1); default: the latest version",
			optional: true,
		},
	],
	options: {
		barcode: {
			type: "string",
			valueName: "digits",
			description:
				"Show the food that has this barcode instead; a UPC-A code and its EAN-13 form are the same barcode",
		},
	},
	run: async (
		{ values, positionals },
		{ services, io }: CommandEnv<Pick<Services, "foods">>,
	) => {
		const [ref] = positionals;
		const shown = await services.foods.show({
			...(ref === undefined ? {} : { ref }),
			...(values.barcode === undefined ? {} : { barcode: values.barcode }),
		});
		const { food } = shown;
		const lines = [
			formatItems([
				{
					kind: "food",
					slug: shown.slug,
					version: food.version,
					name: food.name,
				},
			]),
			`Created: ${food.created}\n`,
		];
		if (food.version !== shown.latestVersion) {
			lines.push(`Latest version: ${shown.latestVersion}\n`);
		}
		if (shown.archived) lines.push("Archived: yes\n");
		if (food.barcodes.length > 0) {
			lines.push(`Barcodes: ${food.barcodes.join(", ")}\n`);
		}
		lines.push(
			formatStoredNutrients(
				`Per ${food.per} ${food.baseUnit}`,
				shown.nutrients,
			),
			"Units:\n",
			formatColumns(
				[
					[food.baseUnit, "base unit"],
					...[...food.units].map(([name, size]) => [
						name,
						`${size} ${food.baseUnit}`,
					]),
				],
				"  ",
			),
		);
		io.stdout(lines.join(""));
	},
});
