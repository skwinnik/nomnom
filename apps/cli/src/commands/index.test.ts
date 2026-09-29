import { expect, test } from "bun:test";
import { BUILT_IN_OPTION_NAMES, type Services } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { createWritesMock } from "../__mocks__/writes";
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

test("nomnom food --help lists every food command", async () => {
	const io = createCapturedIo();

	const code = await runCli({
		argv: ["food", "--help"],
		commands,
		services: {} as Services,
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});

	expect(code).toBe(0);
	for (const name of [
		"add",
		"list",
		"show",
		"update",
		"archive",
		"unarchive",
	]) {
		expect(io.out).toContain(`food ${name} `);
	}
});

test("nomnom recipe --help lists every recipe command", async () => {
	const io = createCapturedIo();

	const code = await runCli({
		argv: ["recipe", "--help"],
		commands,
		services: {} as Services,
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});

	expect(code).toBe(0);
	for (const name of [
		"add",
		"list",
		"show",
		"update",
		"archive",
		"unarchive",
	]) {
		expect(io.out).toContain(`recipe ${name} `);
	}
});

test("nomnom --help lists search and the recipe commands", async () => {
	const io = createCapturedIo();

	await runCli({
		argv: ["--help"],
		commands,
		services: {} as Services,
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});

	for (const name of ["search ", "recipe list ", "recipe show "]) {
		expect(io.out).toContain(name);
	}
});

test("exactly the commands that write declare it", () => {
	const writing = commands
		.filter((command) => command.writes)
		.map((command) => command.name.join(" "));

	expect(writing.sort()).toEqual([
		"food add",
		"food archive",
		"food unarchive",
		"food update",
		"log",
		"recipe add",
		"recipe archive",
		"recipe unarchive",
		"recipe update",
	]);
});
