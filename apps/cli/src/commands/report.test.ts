import { describe, expect, test } from "bun:test";
import { NomnomError, type Report } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { day, meal, ramenEntry, report as reportOf } from "../__mocks__/report";
import { createReportServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { report } from "./report";
import { reportJson } from "./report-json";
import { formatReport } from "./report-text";

const dinner = reportOf([day("2026-09-29", [meal("dinner", [ramenEntry])])]);

async function run(
	args: string[],
	outcome: { result?: Report; error?: NomnomError } = { result: dinner },
) {
	const service = createReportServiceMock(outcome);
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["report", ...args],
		commands: [report],
		services: { report: service },
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});
	return { code, out: io.out, err: io.err, calls: service.calls };
}

describe("report", () => {
	test.each([
		[[], { entries: false }],
		[["2026-09-29"], { from: "2026-09-29", entries: false }],
		[
			["2026-09-23", "2026-09-29"],
			{ from: "2026-09-23", to: "2026-09-29", entries: false },
		],
		[
			["2026-09-23", "2026-09-29", "--entries"],
			{ from: "2026-09-23", to: "2026-09-29", entries: true },
		],
	])("maps %j to the service input", async (args, input) => {
		expect((await run(args)).calls).toEqual([input]);
	});

	test("prints the text report", async () => {
		expect(await run([])).toMatchObject({
			code: 0,
			out: formatReport(dinner),
			err: "",
		});
	});

	test("prints the JSON document on one line with --json", async () => {
		const result = await run(["2026-09-29", "--json"]);

		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(result.out).toBe(`${JSON.stringify(reportJson(dinner))}\n`);
		expect(JSON.parse(result.out)).toMatchObject({
			from: "2026-09-29",
			to: "2026-09-29",
		});
	});

	test("prints warnings to stderr", async () => {
		const warned: Report = {
			...dinner,
			warnings: [
				{
					file: "/data/logs/2026/2026-09-29.nom",
					line: 4,
					message: "'brunch' is not a meal in config.yaml",
				},
			],
		};

		for (const args of [[], ["--json"]]) {
			const result = await run(args, { result: warned });

			expect(result.code).toBe(0);
			expect(result.err).toBe(
				"warning: /data/logs/2026/2026-09-29.nom:4: 'brunch' is not a meal in config.yaml\n",
			);
			expect(result.out).not.toBe("");
		}
	});

	test("a NomnomError prints the problems and nothing on stdout", async () => {
		const error = new NomnomError(
			"2 day files have errors; fix them to report on this range",
			[
				{ file: "/data/logs/2026/2026-09-10.nom", line: 4, message: "bad" },
				{ file: "/data/logs/2026/2026-09-17.nom", line: 2, message: "worse" },
			],
		);

		expect(
			await run(["2026-09-01", "2026-09-30", "--json"], { error }),
		).toEqual({
			code: 1,
			out: "",
			err: [
				"error: 2 day files have errors; fix them to report on this range",
				"/data/logs/2026/2026-09-10.nom:4: bad",
				"/data/logs/2026/2026-09-17.nom:2: worse",
				"",
			].join("\n"),
			calls: [{ from: "2026-09-01", to: "2026-09-30", entries: false }],
		});
	});

	test("a third date is a usage error", async () => {
		const result = await run(["2026-09-01", "2026-09-02", "2026-09-03"]);

		expect(result.code).toBe(1);
		expect(result.calls).toEqual([]);
		expect(result.err).toContain("too many arguments");
	});

	test("--help lists the arguments and options", async () => {
		const result = await run(["--help"]);

		expect(result.code).toBe(0);
		for (const text of ["[from] [to]", "--entries", "--json"]) {
			expect(result.out).toContain(text);
		}
	});
});
