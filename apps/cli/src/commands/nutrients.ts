import type { Config, Nutrient } from "@nomnom/core";
import type { OptionSpec } from "../runner";

/** One value option per catalog nutrient, as in `--kcal <number>`. */
export function nutrientOptions(
	config: Config,
	describe: (nutrient: Nutrient) => string,
	options: { markRequired?: boolean } = {},
): Record<string, OptionSpec> {
	return Object.fromEntries(
		config.nutrients.map((nutrient): [string, OptionSpec] => [
			nutrient.id,
			{
				type: "string",
				valueName: "number",
				description: describe(nutrient),
				...(options.markRequired && nutrient.required
					? { required: true }
					: {}),
			},
		]),
	);
}

/** The nutrient values among the parsed options that remain after the built-in ones. */
export function nutrientValues(
	rest: Readonly<Record<string, unknown>>,
): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [id, value] of Object.entries(rest)) {
		if (typeof value === "string") values[id] = value;
	}
	return values;
}
