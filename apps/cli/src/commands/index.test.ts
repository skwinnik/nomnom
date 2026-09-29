import { expect, test } from "bun:test";
import { BUILT_IN_OPTION_NAMES } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { commands } from ".";

test("every option other than a nutrient is a reserved built-in option name", () => {
	const nutrientIds = defaultContext.config.nutrients.map(({ id }) => id);
	for (const command of commands) {
		const options =
			typeof command.options === "function"
				? command.options(defaultContext)
				: command.options;
		for (const name of Object.keys(options)) {
			if (nutrientIds.includes(name)) continue;
			expect(BUILT_IN_OPTION_NAMES).toContain(name);
		}
	}
});
