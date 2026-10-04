import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { nutrientOptions, nutrientValues } from "./nutrients";
import { printWarnings } from "./warnings";

export const log = defineCommand({
	name: ["log"],
	summary: "Log what you ate",
	positionals: [
		{ name: "meal", description: "A meal from config.yaml, such as breakfast" },
		{
			name: "food",
			description:
				"A food or recipe, optionally with a version (apple@2); the latest version is pinned by default",
			optional: true,
		},
		{ name: "amount", description: "How much, in the unit", optional: true },
		{
			name: "unit",
			description:
				"The unit, which may be several words; default: the item's default unit",
			optional: true,
			variadic: true,
		},
	],
	options: (ctx) => ({
		entry: {
			type: "string",
			multiple: true,
			valueName: "line",
			description:
				"An entry as in a day file: 'apple 1 medium apple' or '\"ramen\" kcal=800', optionally after a time HH:MM as in '08:15 apple 1'; without a version the latest is pinned",
		},
		inline: {
			type: "string",
			valueName: "description",
			description:
				"Log typed-in nutrient totals instead of a food or recipe, with the nutrient options",
		},
		date: {
			type: "string",
			valueName: "yyyy-mm-dd",
			description: "The day to log to (default: today)",
		},
		time: {
			type: "string",
			valueName: "HH:MM",
			description:
				"The time of the entries, such as 08:15; with --entry, for values without their own time (default: none)",
		},
		...nutrientOptions(
			ctx.config,
			(n) => `${n.name} (${n.unit}) eaten, with --inline`,
		),
	}),
	writes: true,
	run: async (
		{ values, positionals },
		{ services, io }: CommandEnv<Pick<Services, "dayLog">>,
	) => {
		const [meal = "", ref, amount, ...unitWords] = positionals;
		const { entry, inline, date, time, ...rest } = values;
		const logged = await services.dayLog.log({
			meal,
			...(date === undefined ? {} : { date }),
			...(time === undefined ? {} : { time }),
			...(ref === undefined ? {} : { ref }),
			...(amount === undefined ? {} : { amount }),
			...(unitWords.length === 0 ? {} : { unit: unitWords.join(" ") }),
			...(inline === undefined ? {} : { inline }),
			nutrients: nutrientValues(rest),
			entries: entry ?? [],
		});
		printWarnings(io, logged.warnings);
		io.stdout(logged.lines.map((line) => `${line}\n`).join(""));
	},
});
