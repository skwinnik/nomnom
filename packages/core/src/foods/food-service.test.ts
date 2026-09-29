import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { localTimestamp } from "../shared/time";
import { food, recipe } from "../store/__mocks__/versioned-store";
import type { FoodVersion } from "../store/records";
import { createVersionedStore } from "../store/versioned-store";
import { serialiseFood, serialiseRecipe } from "../store/write";
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
	return { fs, add, foods };
}

/** The file of a food with these versions. */
function foodFile(...versions: FoodVersion[]): string {
	return versions.map(serialiseFood).join("");
}

const pancakesFile = serialiseRecipe(recipe({ name: "Pancakes" }));

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

describe("food add barcodes", () => {
	const cola = {
		"/data/foods/cola-034000470693.yaml": foodFile(
			food({ name: "Cola", barcodes: ["034000470693"] }),
		),
	};

	test.each([
		["as stored", "034000470693"],
		["in another form", "0034000470693"],
	])("rejects a barcode another food has %s", async (_name, barcode) => {
		const { fs, add } = setup(cola);

		const error = await rejection(
			add({ name: "Coca Cola", barcodes: [barcode] }),
		);

		expect(error.message).toBe(
			`Barcode '${barcode}' already belongs to the food 'cola-034000470693'`,
		);
		expect(fs.files.size).toBe(1);
	});

	test("checks every barcode, not only the first", async () => {
		const { add } = setup(cola);

		const error = await rejection(
			add({ name: "Coca Cola", barcodes: ["4601234567890", "34000470693"] }),
		);

		expect(error.message).toContain("'cola-034000470693'");
	});

	test("rejects the same barcode twice in one command, naming both", async () => {
		const { fs, add } = setup();

		const error = await rejection(
			add({ barcodes: ["034000470693", "0034000470693"] }),
		);

		expect(error.message).toBe(
			"Barcodes '034000470693' and '0034000470693' are the same barcode",
		);
		expect(fs.files.size).toBe(0);
	});

	test("accepts the barcode of an archived food", async () => {
		const { add } = setup({
			"/data/foods/cola-034000470693.yaml": foodFile(
				food({ name: "Cola", barcodes: ["034000470693"] }),
				food({
					name: "Cola",
					barcodes: ["034000470693"],
					version: 2,
					archived: true,
				}),
			),
		});

		const { slug, food: added } = await add({
			name: "Coca Cola",
			barcodes: ["034000470693"],
		});

		expect(slug).toBe("coca-cola-034000470693");
		expect(added.barcodes).toEqual(["034000470693"]);
	});

	test("only the latest version's barcodes count", async () => {
		const { add } = setup({
			"/data/foods/cola-111.yaml": foodFile(
				food({ name: "Cola", barcodes: ["111", "4601234567890"] }),
				food({ name: "Cola", barcodes: ["111"], version: 2 }),
			),
		});

		const { slug } = await add({ name: "Soda", barcodes: ["4601234567890"] });

		expect(slug).toBe("soda-4601234567890");
	});

	test("a broken food file fails add without writing", async () => {
		const { fs, add } = setup({ "/data/foods/rice.yaml": "version: [" });

		const error = await rejection(add({ name: "Apple" }));

		expect(error.message).toContain("/data/foods/rice.yaml");
		expect(fs.files.size).toBe(1);
	});
});

describe("food list", () => {
	test("lists non-archived foods by their latest version, in slug order", async () => {
		const { foods } = setup({
			"/data/foods/greek-yogurt-2-4601234567890.yaml": foodFile(
				food({ name: "Greek Yogurt 2%", barcodes: ["4601234567890"] }),
			),
			"/data/foods/apple.yaml": foodFile(
				food({ name: "Old Apple" }),
				food({ name: "Apple", version: 2 }),
			),
			"/data/foods/rice.yaml": foodFile(
				food({ name: "Rice" }),
				food({ name: "Rice", version: 2, archived: true }),
			),
		});

		expect(await foods.list()).toEqual([
			{ kind: "food", slug: "apple", version: 2, name: "Apple" },
			{
				kind: "food",
				slug: "greek-yogurt-2-4601234567890",
				version: 1,
				name: "Greek Yogurt 2%",
			},
		]);
	});

	test("is empty without foods", async () => {
		const { foods } = setup();

		expect(await foods.list()).toEqual([]);
	});

	test("never reads recipes", async () => {
		const { foods } = setup({
			"/data/foods/apple.yaml": foodFile(food({ name: "Apple" })),
			"/data/recipes/pancakes.yaml": pancakesFile,
			"/data/recipes/stew.yaml": "version: [",
		});

		expect((await foods.list()).map((item) => item.slug)).toEqual(["apple"]);
	});

	test("a broken food file fails the list, naming it", async () => {
		const { foods } = setup({
			"/data/foods/apple.yaml": foodFile(food({ name: "Apple" })),
			"/data/foods/rice.yaml": "version: [",
		});

		const error = await rejection(foods.list());

		expect(error.message).toContain("/data/foods/rice.yaml");
	});
});

describe("food show", () => {
	const apple = foodFile(
		food({ name: "Apple", nutrients: { kcal: 50 } }),
		food({
			name: "Apple",
			version: 2,
			barcodes: ["4601234567890"],
			nutrients: { kcal: 52, protein: 0.3, carbs: 14, fiber: 2.4 },
			units: { "medium sized apple": 180 },
		}),
	);

	function showSetup() {
		return setup({
			"/data/foods/apple.yaml": apple,
			"/data/foods/rice.yaml": foodFile(
				food({ name: "Rice" }),
				food({ name: "Rice", version: 2, archived: true }),
			),
			"/data/recipes/pancakes.yaml": pancakesFile,
		});
	}

	test("shows the latest version with every catalog nutrient", async () => {
		const { foods } = showSetup();

		const shown = await foods.show({ ref: "apple" });

		expect(shown.slug).toBe("apple");
		expect(shown.food.version).toBe(2);
		expect(shown.food.barcodes).toEqual(["4601234567890"]);
		expect(shown.latestVersion).toBe(2);
		expect(shown.archived).toBe(false);
		expect(shown.nutrients).toEqual([
			{ id: "kcal", name: "Energy", unit: "kcal", value: 52 },
			{ id: "protein", name: "Protein", unit: "g", value: 0.3 },
			{ id: "fat", name: "Fat", unit: "g", value: undefined },
			{ id: "carbs", name: "Carbohydrates", unit: "g", value: 14 },
			{ id: "fiber", name: "Fiber", unit: "g", value: 2.4 },
		]);
	});

	test("shows an older version", async () => {
		const { foods } = showSetup();

		const shown = await foods.show({ ref: "apple@1" });

		expect(shown.food.version).toBe(1);
		expect(shown.latestVersion).toBe(2);
		expect(shown.nutrients[0]?.value).toBe(50);
	});

	test("rejects a version that does not exist, naming it", async () => {
		const { foods } = showSetup();

		const error = await rejection(foods.show({ ref: "apple@7" }));

		expect(error.message).toBe(
			"'apple@7' does not exist: food 'apple' has versions 1 to 2",
		);
	});

	test("shows an archived food", async () => {
		const { foods } = showSetup();

		const shown = await foods.show({ ref: "rice" });

		expect(shown.archived).toBe(true);
		expect(shown.food.version).toBe(2);
		expect((await foods.show({ ref: "rice@1" })).archived).toBe(true);
	});

	test("a recipe's slug is not found, like an unknown slug", async () => {
		const { foods } = showSetup();

		const recipeError = await rejection(foods.show({ ref: "pancakes" }));
		const unknownError = await rejection(foods.show({ ref: "unicorn" }));

		expect(recipeError.message).toBe("There is no food 'pancakes'");
		expect(unknownError.message).toBe("There is no food 'unicorn'");
	});
});

describe("food show by barcode", () => {
	function barcodeSetup(files: Record<string, string> = {}) {
		return setup({
			"/data/foods/cola-034000470693.yaml": foodFile(
				food({ name: "Cola", barcodes: ["034000470693"] }),
			),
			"/data/foods/cola-111.yaml": foodFile(
				food({ name: "Cola", barcodes: ["111"] }),
				food({ name: "Cola", version: 2, barcodes: ["111", "4601234567890"] }),
			),
			...files,
		});
	}

	test("finds a food by its EAN-13 form", async () => {
		const { foods } = barcodeSetup();

		const shown = await foods.show({ barcode: "0034000470693" });

		expect(shown.slug).toBe("cola-034000470693");
		expect(shown.food.version).toBe(1);
	});

	test("finds a food by a barcode that is not in the slug, showing its latest version", async () => {
		const { foods } = barcodeSetup();

		const shown = await foods.show({ barcode: "4601234567890" });

		expect(shown.slug).toBe("cola-111");
		expect(shown.food.version).toBe(2);
	});

	test("an unknown barcode fails naming it and its normalized form", async () => {
		const { foods } = setup();

		const error = await rejection(foods.show({ barcode: "034000470693" }));

		expect(error.message).toBe(
			"No food has the barcode '034000470693' (normalized: 0034000470693)",
		);
	});

	test("an archived food is not found by its barcode", async () => {
		const { foods } = setup({
			"/data/foods/milk-4601234567890.yaml": foodFile(
				food({ name: "Milk", barcodes: ["4601234567890"] }),
				food({
					name: "Milk",
					version: 2,
					barcodes: ["4601234567890"],
					archived: true,
				}),
			),
		});

		const error = await rejection(foods.show({ barcode: "4601234567890" }));

		expect(error.message).toBe(
			"No food has the barcode '4601234567890' (normalized: 4601234567890)",
		);
	});

	test("several foods with the barcode fail, naming each", async () => {
		const { foods } = setup({
			"/data/foods/cola-1.yaml": foodFile(
				food({ name: "Cola", barcodes: ["1", "4601234567890"] }),
			),
			"/data/foods/cola-2.yaml": foodFile(
				food({ name: "Cola" }),
				food({ name: "Cola", version: 2 }),
				food({ name: "Cola", version: 3, barcodes: ["2", "4601234567890"] }),
			),
		});

		const error = await rejection(foods.show({ barcode: "4601234567890" }));

		expect(error.message).toBe(
			"Several foods have the barcode '4601234567890': cola-1@1, cola-2@3",
		);
	});

	test.each([
		["both a slug and a barcode", { ref: "apple", barcode: "4601234567890" }],
		["neither", {}],
	])("rejects %s", async (_name, input) => {
		const { foods } = barcodeSetup();

		const error = await rejection(foods.show(input));

		expect(error.message).toBe(
			"Give exactly one of a food and --barcode to show a food",
		);
	});

	test("rejects a barcode with other characters", async () => {
		const { foods } = barcodeSetup();

		const error = await rejection(foods.show({ barcode: "46012abc" }));

		expect(error.message).toBe(
			"A barcode must contain digits only, got '46012abc'",
		);
	});

	test("a broken food file fails the lookup", async () => {
		const { foods } = barcodeSetup({ "/data/foods/rice.yaml": "version: [" });

		const error = await rejection(foods.show({ barcode: "4601234567890" }));

		expect(error.message).toContain("/data/foods/rice.yaml");
	});
});
