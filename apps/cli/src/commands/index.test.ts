import { expect, test } from "bun:test";
import { BUILT_IN_OPTION_NAMES, type Services } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { runCli } from "../runner";
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

test("nomnom food --help lists add, list and show", async () => {
	const io = createCapturedIo();

	const code = await runCli({
		argv: ["food", "--help"],
		commands,
		services: {} as Services,
		io,
		resolveContext: () => defaultContext,
	});

	expect(code).toBe(0);
	expect(io.out).toContain("food add ");
	expect(io.out).toContain("food list ");
	expect(io.out).toContain("food show ");
});

test("nomnom --help lists search and the recipe commands", async () => {
	const io = createCapturedIo();

	await runCli({
		argv: ["--help"],
		commands,
		services: {} as Services,
		io,
		resolveContext: () => defaultContext,
	});

	for (const name of ["search ", "recipe list ", "recipe show "]) {
		expect(io.out).toContain(name);
	}
});
