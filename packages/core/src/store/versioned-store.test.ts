import { describe, expect, test } from "bun:test";
import { createFixedClock } from "../clock/__mocks__/clock";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { localTimestamp } from "../shared/time";
import type { NewFoodVersion, NewRecipeVersion } from "./records";
import { createVersionedStore } from "./versioned-store";

const now = new Date("2026-09-29T17:10:00Z");

function setup(files: Record<string, string> = {}) {
	const fs = createMemoryFileSystem(files);
	const store = createVersionedStore({
		fs,
		clock: createFixedClock(now),
		paths: dataPaths("/data"),
	});
	return { fs, store };
}

const apple: NewFoodVersion = {
	name: "Apple",
	barcodes: ["0123456789012", "4601234567890"],
	baseUnit: "g",
	per: 100,
	nutrients: new Map([
		["kcal", 52],
		["protein", 0.3],
	]),
	units: new Map([
		["small sized apple", 134],
		["a=b: c", 5],
		["123", 7],
	]),
};

describe("createFood", () => {
	test("writes a food that reads back with equal values", async () => {
		const { store } = setup();

		const created = await store.createFood("apple-0123456789012", apple);
		const read = await store.readFood("apple-0123456789012");

		expect(created.path).toBe("/data/foods/apple-0123456789012.yaml");
		expect(read).toEqual([created.record]);
		expect(created.record).toEqual({
			...apple,
			version: 1,
			created: localTimestamp(now),
			archived: false,
		});
	});

	test("starts with ---, quotes barcodes and writes only what was given", async () => {
		const { fs, store } = setup();

		await store.createFood("rice", {
			name: "Rice",
			barcodes: [],
			baseUnit: "g",
			per: 100,
			nutrients: new Map([["kcal", 360]]),
			units: new Map(),
		});
		await store.createFood("milk", { ...apple, name: "Milk" });

		expect(fs.files.get("/data/foods/rice.yaml")).toBe(
			[
				"---",
				"version: 1",
				`created: ${localTimestamp(now)}`,
				"name: Rice",
				"base_unit: g",
				"per: 100",
				"nutrients:",
				"  kcal: 360",
				"",
			].join("\n"),
		);
		expect(fs.files.get("/data/foods/milk.yaml")).toContain(
			'barcodes:\n  - "0123456789012"\n  - "4601234567890"\n',
		);
	});

	test("never overwrites an existing file", async () => {
		const { fs, store } = setup({ "/data/foods/apple.yaml": "original" });

		const error = await store.createFood("apple", apple).catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toContain("'apple' already exists");
		expect(fs.files.get("/data/foods/apple.yaml")).toBe("original");
	});
});

describe("createRecipe", () => {
	test("writes a recipe that reads back with equal values", async () => {
		const { fs, store } = setup();
		const soup: NewRecipeVersion = {
			name: "Chicken Soup",
			servings: 4,
			yield: { baseUnit: "g", amount: 1000 },
			units: new Map([["bowl", 350]]),
			ingredients: [
				{
					kind: "food",
					slug: "chicken-breast",
					version: 2,
					amount: 300,
					unit: "g",
				},
				{
					kind: "food",
					slug: "carrot",
					version: 1,
					amount: 2,
					unit: "medium carrot",
				},
				{
					kind: "recipe",
					slug: "stock",
					version: 1,
					amount: 0.5,
					unit: "serving",
				},
			],
		};

		const created = await store.createRecipe("chicken-soup", soup);

		expect(await store.readRecipe("chicken-soup")).toEqual([created.record]);
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toContain(
			[
				"ingredients:",
				"  - food: chicken-breast",
				"    version: 2",
				"    amount: 300",
				"    unit: g",
			].join("\n"),
		);
	});
});

describe("reading", () => {
	test("returns undefined for an item without a file", async () => {
		const { store } = setup();

		expect(await store.readFood("nope")).toBeUndefined();
		expect(await store.readRecipe("nope")).toBeUndefined();
	});
});
