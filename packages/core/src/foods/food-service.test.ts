import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { localTimestamp } from "../shared/time";
import { createVersionedStore } from "../store/versioned-store";
import { createFoodService, type FoodAddInput } from "./food-service";

const now = new Date("2026-09-29T17:10:00Z");

function setup(files: Record<string, string> = {}) {
	const fs = createMemoryFileSystem(files);
	const store = createVersionedStore({
		fs,
		clock: createFixedClock(now),
		paths: dataPaths("/data"),
	});
	const foods = createFoodService({
		config: createStaticConfigService(),
		catalog: createCatalog({ store }),
		store,
	});
	const add = (input: Partial<FoodAddInput>) =>
		foods.add({
			name: "Rice",
			baseUnit: "g",
			nutrients: { kcal: "360" },
			...input,
		});
	return { fs, add };
}

async function rejection(promise: Promise<unknown>): Promise<NomnomError> {
	const error: unknown = await promise.catch((e) => e);
	expect(error).toBeInstanceOf(NomnomError);
	return error as NomnomError;
}

describe("food add", () => {
	test("writes the file described by the spec", async () => {
		const { fs, add } = setup();

		const added = await add({
			name: "Apple",
			per: "100",
			nutrients: { kcal: "52", protein: "0.3" },
			units: ["small sized apple=134"],
		});

		expect(added.path).toBe("/data/foods/apple.yaml");
		expect(fs.files.get("/data/foods/apple.yaml")).toBe(
			[
				"---",
				"version: 1",
				`created: ${localTimestamp(now)}`,
				"name: Apple",
				"base_unit: g",
				"per: 100",
				"nutrients:",
				"  kcal: 52",
				"  protein: 0.3",
				"units:",
				"  small sized apple: 134",
				"",
			].join("\n"),
		);
	});

	test("a minimal food defaults per to 100 and stores only the given nutrients", async () => {
		const { add } = setup();

		const { food } = await add({});

		expect(food.per).toBe(100);
		expect([...food.nutrients]).toEqual([["kcal", 360]]);
	});

	test("stores nutrients in catalog order", async () => {
		const { add } = setup();

		const { food } = await add({
			nutrients: { fiber: "1", kcal: "360", protein: "7" },
		});

		expect([...food.nutrients.keys()]).toEqual(["kcal", "protein", "fiber"]);
	});

	test("fails without writing when a required nutrient is missing", async () => {
		const { fs, add } = setup();

		const error = await rejection(add({ nutrients: { protein: "7" } }));

		expect(error.message).toContain("'kcal'");
		expect(fs.files.size).toBe(0);
	});

	test("rejects a nutrient that is not in the catalog", async () => {
		const { add } = setup();

		const error = await rejection(
			add({ nutrients: { kcal: "360", protien: "7" } }),
		);

		expect(error.message).toContain("'protien'");
	});

	test.each([
		[
			"a negative nutrient value",
			{ nutrients: { kcal: "-5" } },
			"'kcal' must not be negative",
		],
		[
			"a nutrient value that is not a number",
			{ nutrients: { kcal: "lots" } },
			"'kcal' must be a number",
		],
		["a zero per", { per: "0" }, "'per' must be a positive number"],
		["an empty name", { name: "  " }, "name must not be empty"],
		[
			"a name without letters or digits",
			{ name: "%%%" },
			"no letters or digits",
		],
		["a unit name with a hash", { units: ["can #2=400"] }, "can't contain '#'"],
		[
			"a duplicate unit",
			{ units: ["cup=240", "cup=250"] },
			"Unit 'cup' is defined more than once",
		],
		[
			"redefining the base unit",
			{ units: ["g=1"] },
			"'g' is already the base unit",
		],
		[
			"a unit without an amount",
			{ units: ["cup"] },
			"Expected <name>=<amount>",
		],
		["a non-numeric barcode", { barcodes: ["abc"] }, "digits only"],
		[
			"a duplicate barcode",
			{ barcodes: ["123", "123"] },
			"given more than once",
		],
		["an empty base unit", { baseUnit: " " }, "must not be empty"],
	])("rejects %s without writing", async (_name, input, message) => {
		const { fs, add } = setup();

		const error = await rejection(add(input));

		expect(error.message).toContain(message);
		expect(fs.files.size).toBe(0);
	});

	test("accepts long and short unit names, and names containing =", async () => {
		const { add } = setup();

		const { food } = await add({
			units: [
				"100g=100",
				"'small sized apple'=134".replaceAll("'", ""),
				"a=b=5",
			],
		});

		expect([...food.units]).toEqual([
			["100g", 100],
			["small sized apple", 134],
			["a=b", 5],
		]);
	});

	test("keeps a barcode's leading zero, quotes it and puts it in the slug", async () => {
		const { fs, add } = setup();

		const { slug, food } = await add({
			name: "Milk",
			barcodes: ["0123456789012"],
		});

		expect(slug).toBe("milk-0123456789012");
		expect(food.barcodes).toEqual(["0123456789012"]);
		expect(fs.files.get("/data/foods/milk-0123456789012.yaml")).toContain(
			'  - "0123456789012"',
		);
	});

	test.each([
		["Greek Yogurt 2%", [], "greek-yogurt-2"],
		[
			"Greek Yogurt 2%",
			["4601234567890", "4601234567906"],
			"greek-yogurt-2-4601234567890",
		],
		["Творог 5%", [], "творог-5"],
	])(
		"%j with barcodes %j is stored as foods/%s.yaml",
		async (name, barcodes, slug) => {
			const { fs, add } = setup();

			await add({ name, barcodes });

			expect(fs.files.has(`/data/foods/${slug}.yaml`)).toBe(true);
		},
	);

	test("fails when the food already exists, leaving the file unchanged", async () => {
		const existing = [
			"---",
			"version: 1",
			"created: 2026-09-01T08:00:00+03:00",
			"name: Apple",
			"base_unit: g",
			"per: 100",
			"nutrients: { kcal: 52 }",
			"",
		].join("\n");
		const { fs, add } = setup({ "/data/foods/apple.yaml": existing });

		const error = await rejection(add({ name: "Apple" }));

		expect(error.message).toBe(
			"'apple' already exists: it is already used by a food",
		);
		expect(fs.files.get("/data/foods/apple.yaml")).toBe(existing);
	});

	test("fails when a recipe uses the slug", async () => {
		const pancakes = [
			"---",
			"version: 1",
			"created: 2026-09-01T08:00:00+03:00",
			"name: Pancakes",
			"servings: 1",
			"ingredients:",
			"  - { food: flour, version: 1, amount: 100, unit: g }",
			"",
		].join("\n");
		const { fs, add } = setup({ "/data/recipes/pancakes.yaml": pancakes });

		const error = await rejection(add({ name: "Pancakes" }));

		expect(error.message).toBe(
			"'pancakes' already exists: it is already used by a recipe",
		);
		expect(fs.files.has("/data/foods/pancakes.yaml")).toBe(false);
	});
});
