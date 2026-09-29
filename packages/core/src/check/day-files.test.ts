import { describe, expect, test } from "bun:test";
import { dataPaths } from "../data-dir/paths";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { scanDayFiles } from "./day-files";

const message = "not a day file: day files are logs/<yyyy>/<yyyy-mm-dd>.nom";

function scan(files: string[]) {
	return scanDayFiles({
		fs: createMemoryFileSystem(
			Object.fromEntries(files.map((file) => [`/data/logs/${file}`, ""])),
		),
		paths: dataPaths("/data"),
	});
}

describe("scanDayFiles", () => {
	test("is empty without logs/", async () => {
		expect(await scan([])).toEqual({ dates: [], invalid: [] });
	});

	test("returns the dates of day files in date order", async () => {
		const result = await scan([
			"2026/2026-09-30.nom",
			"2025/2025-12-31.nom",
			"2026/2026-01-02.nom",
		]);

		expect(result).toEqual({
			dates: ["2025-12-31", "2026-01-02", "2026-09-30"],
			invalid: [],
		});
	});

	test.each([
		["a date without leading zeros", "2026/2026-9-30.nom"],
		["a wrong year directory", "2025/2026-01-01.nom"],
		["a file directly in logs/", "2026-09-30.nom"],
		["a file in another directory", "old/2026-09-30.nom"],
		["a nested directory", "2026/old/2026-09-30.nom"],
		["an impossible date", "2026/2026-02-30.nom"],
		["another name", "2026/today.nom"],
	])("reports %s", async (_name, file) => {
		const result = await scan(["2026/2026-09-29.nom", file]);

		expect(result).toEqual({
			dates: ["2026-09-29"],
			invalid: [{ file: `/data/logs/${file}`, message }],
		});
	});

	test("ignores other files and directories", async () => {
		const result = await scan([
			"notes.txt",
			"2026/2026-09-30.nom~",
			"archive/readme.md",
			"2026/2026-09-30.nom",
		]);

		expect(result).toEqual({ dates: ["2026-09-30"], invalid: [] });
	});

	test("reports every invalid file in path order", async () => {
		const result = await scan([
			"old/2026-09-30.nom",
			"2026/2026-9-30.nom",
			"2026-09-30.nom",
		]);

		expect(result.invalid.map(({ file }) => file)).toEqual([
			"/data/logs/2026-09-30.nom",
			"/data/logs/2026/2026-9-30.nom",
			"/data/logs/old/2026-09-30.nom",
		]);
	});
});
