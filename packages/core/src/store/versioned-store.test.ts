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

describe("listing", () => {
	test("is empty when the directory is missing", async () => {
		const { store } = setup();

		expect(await store.foodSlugs()).toEqual([]);
		expect(await store.recipeSlugs()).toEqual([]);
	});

	test("lists *.yaml files by slug in code point order, ignoring other files and directories", async () => {
		const { store } = setup({
			"/data/foods/apple.yaml": "",
			"/data/foods/apple-pie.yaml": "",
			"/data/foods/banana.yaml": "",
			"/data/foods/notes.txt": "",
			"/data/foods/old/rice.yaml": "",
			"/data/foods/old.yaml/x": "",
			"/data/recipes/soup.yaml": "",
		});

		expect(await store.foodSlugs()).toEqual(["apple", "apple-pie", "banana"]);
		expect(await store.recipeSlugs()).toEqual(["soup"]);
	});

	test("rejects a file name that is not a slug, naming the file", async () => {
		const { store } = setup({
			"/data/foods/apple.yaml": "",
			"/data/foods/My Apple.yaml": "",
		});

		const error = await store.foodSlugs().catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe("/data/foods/My Apple.yaml is invalid");
		expect(error.problems).toEqual([
			{
				file: "/data/foods/My Apple.yaml",
				message:
					"'My Apple' is not a valid file name: use letters, digits and '-'",
			},
		]);
	});

	test("reports every invalid name together", async () => {
		const { store } = setup({
			"/data/foods/apple.yaml": "",
			"/data/foods/My Apple.yaml": "",
			"/data/foods/rice_2.yaml": "",
		});

		const error = await store.foodSlugs().catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe("2 files in /data/foods are invalid");
		expect(error.problems.map(({ file }: { file: string }) => file)).toEqual([
			"/data/foods/My Apple.yaml",
			"/data/foods/rice_2.yaml",
		]);
	});

	test("a scan sorts files into slugs and invalid names, ignoring other files and directories", async () => {
		const { store } = setup({
			"/data/foods/apple.yaml": "",
			"/data/foods/apple-pie.yaml": "",
			"/data/foods/My Apple.yaml": "",
			"/data/foods/notes.txt": "",
			"/data/foods/old/rice.yaml": "",
			"/data/foods/bad name.yaml/x": "",
			"/data/recipes/soup.yaml": "",
			"/data/recipes/.yaml": "",
		});

		expect(await store.scanFoods()).toEqual({
			slugs: ["apple", "apple-pie"],
			invalid: [
				{
					file: "/data/foods/My Apple.yaml",
					message:
						"'My Apple' is not a valid file name: use letters, digits and '-'",
				},
			],
		});
		expect(await store.scanRecipes()).toEqual({
			slugs: ["soup"],
			invalid: [
				{
					file: "/data/recipes/.yaml",
					message: "'' is not a valid file name: use letters, digits and '-'",
				},
			],
		});
	});

	test("rejects a recipe file name that is not a slug", async () => {
		const { store } = setup({ "/data/recipes/.yaml": "" });

		await expect(store.recipeSlugs()).rejects.toThrow(
			"/data/recipes/.yaml is invalid",
		);
	});
});

describe("appending", () => {
	const later = new Date("2026-09-30T08:00:00Z");

	async function withApple(files: Record<string, string> = {}) {
		const { fs, store } = setup(files);
		await store.createFood("apple", apple);
		const first = fs.files.get("/data/foods/apple.yaml") ?? "";
		return { fs, store, first };
	}

	test("keeps the earlier text as an exact prefix and numbers the new version", async () => {
		const { fs, store, first } = await withApple();
		await store.appendFood("apple", { ...apple, per: 50 });
		const second = fs.files.get("/data/foods/apple.yaml") ?? "";

		const appended = await store.appendFood("apple", {
			...apple,
			nutrients: new Map([["kcal", 55]]),
			archived: true,
		});
		const third = fs.files.get("/data/foods/apple.yaml") ?? "";

		expect(second.startsWith(first)).toBe(true);
		expect(third.startsWith(second)).toBe(true);
		expect(third.slice(second.length)).toStartWith("---\nversion: 3\n");
		expect(appended.path).toBe("/data/foods/apple.yaml");
		expect(appended.record).toMatchObject({ version: 3, archived: true });
		const read = await store.readFood("apple");
		expect(read?.map((v) => [v.version, v.per, v.archived])).toEqual([
			[1, 100, false],
			[2, 50, false],
			[3, 100, true],
		]);
		expect(read?.[2]).toEqual(appended.record);
	});

	test("stamps the new version from the clock", async () => {
		const fs = createMemoryFileSystem();
		const clock = createFixedClock(now);
		const store = createVersionedStore({
			fs,
			clock,
			paths: dataPaths("/data"),
		});
		await store.createFood("apple", apple);
		clock.set(later);

		const { record } = await store.appendFood("apple", apple);

		expect(record.created).toBe(localTimestamp(later));
	});

	test("takes the version number from the file, not the caller", async () => {
		const { store } = await withApple();
		const fields = { ...apple, version: 7, created: "x" };

		const { record } = await store.appendFood("apple", fields);

		expect(record.version).toBe(2);
		expect(record.created).toBe(localTimestamp(now));
		expect((await store.readFood("apple"))?.[1]?.version).toBe(2);
	});

	test("adds a newline to a file without a final one", async () => {
		const text = [
			"---",
			"version: 1",
			"created: 2026-09-01T08:00:00+03:00",
			"name: Apple",
			"base_unit: g",
			"per: 100",
			"nutrients: { kcal: 52 }",
		].join("\n");
		const { fs, store } = setup({ "/data/foods/apple.yaml": text });

		await store.appendFood("apple", apple);

		expect(fs.files.get("/data/foods/apple.yaml")).toStartWith(
			`${text}\n---\nversion: 2\n`,
		);
		const read = await store.readFood("apple");
		expect(read?.map((v) => v.version)).toEqual([1, 2]);
		expect(read?.[0]?.nutrients).toEqual(new Map([["kcal", 52]]));
	});

	test("reports a missing file without writing", async () => {
		const { fs, store } = setup();

		const error = await store.appendFood("apple", apple).catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe(
			"There is no food 'apple': /data/foods/apple.yaml",
		);
		expect(fs.files.size).toBe(0);
	});

	test("reports an invalid file without writing", async () => {
		const text = "---\nversion: 1\nname: Apple\n";
		const { fs, store } = setup({ "/data/foods/apple.yaml": text });

		const error = await store.appendFood("apple", apple).catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe("/data/foods/apple.yaml is invalid");
		expect(fs.files.get("/data/foods/apple.yaml")).toBe(text);
	});

	test("appends a recipe version with its ingredient pins", async () => {
		const { fs, store } = setup();
		const soup: NewRecipeVersion = {
			name: "Soup",
			servings: 2,
			units: new Map(),
			ingredients: [
				{ kind: "food", slug: "carrot", version: 1, amount: 2, unit: "g" },
			],
		};
		await store.createRecipe("soup", soup);
		const first = fs.files.get("/data/recipes/soup.yaml") ?? "";

		const { path, record } = await store.appendRecipe("soup", {
			...soup,
			archived: true,
		});

		expect(path).toBe("/data/recipes/soup.yaml");
		expect(fs.files.get(path)).toStartWith(first);
		expect(await store.readRecipe("soup")).toEqual([
			{ ...soup, version: 1, created: localTimestamp(now), archived: false },
			record,
		]);
		expect(record).toMatchObject({ version: 2, archived: true });
	});

	test("reports a missing recipe file", async () => {
		const { store } = setup();

		await expect(
			store.appendRecipe("soup", {
				name: "Soup",
				servings: 1,
				units: new Map(),
				ingredients: [],
			}),
		).rejects.toThrow("There is no recipe 'soup': /data/recipes/soup.yaml");
	});
});
