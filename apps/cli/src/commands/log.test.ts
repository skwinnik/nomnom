import { describe, expect, test } from "bun:test";
import { NomnomError } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { createDayLogServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { log } from "./log";

async function run(args: string[], dayLog = createDayLogServiceMock()) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["log", ...args],
		commands: [log],
		services: { dayLog },
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});
	return { code, out: io.out, err: io.err, calls: dayLog.calls };
}

describe("log", () => {
	test("logs a reference with a multi-word unit and prints the added line", async () => {
		const result = await run([
			"breakfast",
			"apple",
			"1",
			"medium",
			"sized",
			"apple",
			"--date",
			"2026-09-29",
		]);

		expect(result).toMatchObject({
			code: 0,
			out: "apple@2 1 medium sized apple\n",
			err: "",
		});
		expect(result.calls).toEqual([
			{
				meal: "breakfast",
				date: "2026-09-29",
				ref: "apple",
				amount: "1",
				unit: "medium sized apple",
				nutrients: {},
			},
		]);
	});

	test("a reference without a unit or date leaves both to the service", async () => {
		const result = await run(["lunch", "rice@1", "80"]);

		expect(result.calls).toEqual([
			{ meal: "lunch", ref: "rice@1", amount: "80", nutrients: {} },
		]);
	});

	test("logs an inline entry with nutrient options", async () => {
		const dayLog = createDayLogServiceMock({
			result: { line: '"restaurant ramen" kcal=800 protein=35' },
		});

		const result = await run(
			[
				"dinner",
				"--inline",
				"restaurant ramen",
				"--kcal",
				"800",
				"--protein",
				"35",
			],
			dayLog,
		);

		expect(result.out).toBe('"restaurant ramen" kcal=800 protein=35\n');
		expect(result.calls).toEqual([
			{
				meal: "dinner",
				inline: "restaurant ramen",
				nutrients: { kcal: "800", protein: "35" },
			},
		]);
	});

	test("an unknown nutrient option is a usage error", async () => {
		const result = await run([
			"dinner",
			"--inline",
			"ramen",
			"--protien",
			"35",
		]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown option '--protien'");
		expect(result.calls).toEqual([]);
	});

	test("a missing meal is a usage error", async () => {
		const result = await run([]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("missing argument <meal>");
	});

	test("prints warnings about the existing file to stderr and still succeeds", async () => {
		const dayLog = createDayLogServiceMock({
			result: {
				warnings: [
					{
						file: "/data/logs/2026/2026-09-29.nom",
						line: 1,
						message:
							"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
					},
				],
			},
		});

		const result = await run(["breakfast", "apple", "1"], dayLog);

		expect(result.code).toBe(0);
		expect(result.err).toBe(
			"warning: /data/logs/2026/2026-09-29.nom:1: 'brunch' is not a meal in config.yaml; it is kept after the configured meals\n",
		);
		expect(result.out).toBe("apple@2 1 medium sized apple\n");
	});

	test("reports errors in the existing file with their line numbers", async () => {
		const file = "/data/logs/2026/2026-09-29.nom";
		const dayLog = createDayLogServiceMock({
			error: new NomnomError(
				`${file} has errors; fix them before logging to this day`,
				[
					{ file, line: 3, message: "'apple' needs a version" },
					{
						file,
						line: 7,
						message: "'weight' is not a nutrient in config.yaml",
					},
				],
			),
		});

		const result = await run(["breakfast", "apple", "1"], dayLog);

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toBe(
			[
				`error: ${file} has errors; fix them before logging to this day`,
				`${file}:3: 'apple' needs a version`,
				`${file}:7: 'weight' is not a nutrient in config.yaml`,
				"",
			].join("\n"),
		);
	});

	test("reports a meal that is not configured", async () => {
		const message =
			"'brunch' is not a configured meal; the meals are breakfast, lunch, dinner, snack";
		const dayLog = createDayLogServiceMock({ error: new NomnomError(message) });

		const result = await run(["brunch", "apple", "1"], dayLog);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: `error: ${message}\n`,
		});
	});

	test("help lists the positionals, --inline, --date and every nutrient", async () => {
		const result = await run(["--help"]);

		expect(result.out).toContain(
			"Usage: nomnom log <meal> [food] [amount] [unit...] [options]",
		);
		expect(result.out).toContain("--inline <description>");
		expect(result.out).toContain("--date <yyyy-mm-dd>");
		expect(result.out).toContain("--kcal <number>");
		expect(result.out).toContain("--fiber <number>");
		expect(result.out).not.toContain("(required)");
	});

	test("a dry run prints the added line as a real run does", async () => {
		const args = ["lunch", "rice@1", "80"];

		const real = await run(args);
		const dry = await run([...args, "--dry-run"]);

		expect(dry).toMatchObject({
			code: 0,
			out: `${real.out}\nDry run: no files were changed.\n`,
			calls: real.calls,
		});
	});
});
