import { describe, expect, test } from "bun:test";
import { type CheckResult, NomnomError } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createCheckServiceMock } from "../__mocks__/services";
import { runCli } from "../runner";
import { check } from "./check";

async function run(
	args: string[],
	outcome: { result?: Partial<CheckResult>; error?: NomnomError } = {},
) {
	const service = createCheckServiceMock(outcome);
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["check", ...args],
		commands: [check],
		services: { check: service },
		io,
		resolveContext: () => {
			throw new Error("check does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: service.calls };
}

const day = "/data/logs/2026/2026-09-29.nom";
const brunch = {
	file: day,
	line: 1,
	message:
		"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
};

describe("check", () => {
	test("prints warnings, then fails with every error, counting errors and files", async () => {
		const result = await run([], {
			result: {
				warnings: [brunch],
				errors: [
					{ file: "/data/foods/rice.yaml", message: "version 1: bad" },
					{ file: day, line: 3, message: "first" },
					{ file: day, line: 7, message: "second" },
				],
			},
		});

		expect(result).toEqual({
			code: 1,
			out: "",
			err: [
				`warning: ${day}:1: ${brunch.message}`,
				"error: 3 errors in 2 files",
				"/data/foods/rice.yaml: version 1: bad",
				`${day}:3: first`,
				`${day}:7: second`,
				"",
			].join("\n"),
			calls: 1,
		});
	});

	test("uses the singular for one error in one file", async () => {
		const result = await run([], {
			result: { errors: [{ file: day, line: 3, message: "bad" }] },
		});

		expect(result.err).toStartWith("error: 1 error in 1 file\n");
	});

	test("succeeds with warnings only, counting the files checked", async () => {
		const result = await run([], {
			result: {
				warnings: [brunch],
				checked: { foods: 12, recipes: 3, days: 40 },
			},
		});

		expect(result).toEqual({
			code: 0,
			out: "No errors in 12 foods, 3 recipes and 40 day files\n",
			err: `warning: ${day}:1: ${brunch.message}\n`,
			calls: 1,
		});
	});

	test("uses the singular for counts of one", async () => {
		const result = await run([], {
			result: { checked: { foods: 1, recipes: 1, days: 1 } },
		});

		expect(result.out).toBe("No errors in 1 food, 1 recipe and 1 day file\n");
	});

	test("an empty data directory has no errors", async () => {
		expect(await run([])).toEqual({
			code: 0,
			out: "No errors in 0 foods, 0 recipes and 0 day files\n",
			err: "",
			calls: 1,
		});
	});

	test("reports an invalid config as the service throws it", async () => {
		const result = await run([], {
			error: new NomnomError("/data/config.yaml is invalid", [
				{ file: "/data/config.yaml", line: 2, message: "bad" },
			]),
		});

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: "error: /data/config.yaml is invalid\n/data/config.yaml:2: bad\n",
		});
	});

	test("takes no arguments", async () => {
		const result = await run(["2026-09-29"]);

		expect(result.code).toBe(1);
		expect(result.calls).toBe(0);
	});

	test("--help describes the command", async () => {
		const result = await run(["--help"]);

		expect(result.code).toBe(0);
		expect(result.calls).toBe(0);
		expect(result.out).toContain("Check every file in the data directory");
	});
});
