import { expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { defaultConfig } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { createFakeStore, food } from "../store/__mocks__/versioned-store";
import { readDay } from "./read-day";

const path = "/data/logs/2026/2026-09-29.nom";

function deps(files: Record<string, string> = {}) {
	return {
		fs: createMemoryFileSystem(files),
		paths: dataPaths("/data"),
		catalog: createCatalog({
			store: createFakeStore({ foods: { apple: [food()] } }),
		}),
	};
}

test("a missing file counts as empty", async () => {
	expect(await readDay(deps(), defaultConfig, "2026-09-29")).toEqual({
		path,
		lines: [],
		check: { errors: [], warnings: [], meals: new Map() },
	});
});

test("reads, parses and validates an existing file", async () => {
	const day = await readDay(
		deps({ [path]: "[lunch]\napple@1 80\napple 1\n" }),
		defaultConfig,
		"2026-09-29",
	);

	expect(day.path).toBe(path);
	expect(day.lines.map(({ raw }) => raw)).toEqual([
		"[lunch]",
		"apple@1 80",
		"apple 1",
	]);
	expect(day.check.meals.get("lunch")?.map(({ number }) => number)).toEqual([
		2,
	]);
	expect(day.check.errors).toEqual([
		{
			file: path,
			line: 3,
			message: expect.stringContaining("needs a version"),
		},
	]);
});
