import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import {
	createStaticConfigService,
	defaultConfig,
} from "../config/__mocks__/config-service";
import type { Config } from "../config/config";
import {
	createFakeStore,
	food,
	parsedRecipe,
	recipe,
} from "../store/__mocks__/versioned-store";
import type { FoodVersion, Ingredient, RecipeVersion } from "../store/records";
import { createNutrition } from "./nutrition";

const chickenBreast = [
	food({ nutrients: { kcal: 120 } }),
	food({ version: 2, nutrients: { kcal: 165, protein: 31 } }),
];
const carrot = [
	food({ nutrients: { kcal: 41, fiber: 2.8 }, units: { "medium carrot": 61 } }),
];
const water = [food({ baseUnit: "ml", nutrients: { kcal: 0 } })];

const soupIngredients: Ingredient[] = [
	{ kind: "food", slug: "chicken-breast", version: 2, amount: 300, unit: "g" },
	{
		kind: "food",
		slug: "carrot",
		version: 1,
		amount: 2,
		unit: "medium carrot",
	},
	{ kind: "food", slug: "water", version: 1, amount: 700, unit: "ml" },
];
const soup = recipe({
	name: "Chicken Soup",
	servings: 4,
	yield: { baseUnit: "g", amount: 1000 },
	ingredients: soupIngredients,
});

function setup(
	items: {
		foods?: Record<string, FoodVersion[]>;
		recipes?: Record<string, RecipeVersion[]>;
	} = {},
	config: Config = defaultConfig,
) {
	const store = createFakeStore({
		foods: { "chicken-breast": chickenBreast, carrot, water, ...items.foods },
		recipes: { "chicken-soup": [soup], ...items.recipes },
	});
	const catalog = createCatalog({ store });
	const nutrition = createNutrition({
		catalog,
		config: createStaticConfigService(config),
	});
	return { store, catalog, nutrition };
}

describe("soup example", () => {
	test("sums the ingredients of a recipe that is not saved yet", async () => {
		const { nutrition } = setup();

		const total = await nutrition.sumOf(soupIngredients);

		expect(total.get("kcal")).toBeCloseTo(545.02, 10);
		expect(total.get("protein")).toBeCloseTo(93, 10);
		expect(total.get("fiber")).toBeCloseTo(3.416, 10);
		expect(total.get("fat")).toBe(0);
		expect([...total.keys()]).toEqual([
			"kcal",
			"protein",
			"fat",
			"carbs",
			"fiber",
		]);
	});

	test("gives per-serving and per-100 g values of a saved recipe", async () => {
		const { nutrition, catalog } = setup();
		const item = await catalog.resolve({ slug: "chicken-soup" });

		const serving = await nutrition.amountOf(item, 1, "serving");
		const hundred = await nutrition.amountOf(item, 100, "g");

		expect(serving.get("kcal")).toBeCloseTo(136.255, 10);
		expect(hundred.get("kcal")).toBeCloseTo(54.502, 10);
	});
});

describe("foods", () => {
	test("scales by amount, unit and per, with absent nutrients as 0", async () => {
		const { nutrition, catalog } = setup();
		const item = await catalog.resolve({ slug: "carrot" });

		const values = await nutrition.amountOf(item, 2, "medium carrot");

		expect(values.get("kcal")).toBe(50.02);
		expect(values.get("protein")).toBe(0);
	});

	test("rejects an ingredient that stores a nutrient removed from the catalog", async () => {
		const { nutrition } = setup(
			{ foods: { old: [food({ nutrients: { kcal: 10, retired: 99 } })] } },
			{
				nutrients: [
					{ id: "kcal", name: "Energy", unit: "kcal", required: true },
				],
				meals: ["lunch"],
			},
		);

		await expect(
			nutrition.sumOf([
				{ kind: "food", slug: "old", version: 1, amount: 100, unit: "g" },
			]),
		).rejects.toThrow(
			"'old@1' is unusable: 'retired' is not a nutrient in config.yaml",
		);
	});

	test("rejects a unit the version does not allow, listing the allowed ones", async () => {
		const { nutrition, catalog } = setup();
		const item = await catalog.resolve({ slug: "carrot" });

		await expect(nutrition.amountOf(item, 2, "cup")).rejects.toThrow(
			"'cup' is not a unit of carrot@1; it allows 'g', 'medium carrot'",
		);
	});
});

describe("nested recipes", () => {
	test("a recipe includes the consumed fraction of a nested recipe", async () => {
		const stock = recipe({
			servings: 8,
			yield: { baseUnit: "g", amount: 2000 },
			ingredients: [
				{
					kind: "food",
					slug: "chicken-breast",
					version: 1,
					amount: 1000,
					unit: "g",
				},
			],
		});
		const { nutrition } = setup({ recipes: { "chicken-stock": [stock] } });

		const inGrams = await nutrition.sumOf([
			{
				kind: "recipe",
				slug: "chicken-stock",
				version: 1,
				amount: 500,
				unit: "g",
			},
		]);
		const inServings = await nutrition.sumOf([
			{
				kind: "recipe",
				slug: "chicken-stock",
				version: 1,
				amount: 2,
				unit: "serving",
			},
		]);

		// chicken-stock@1 is 1200 kcal in total; 500 of 2000 g and 2 of 8 servings are a quarter.
		expect(inGrams.get("kcal")).toBe(300);
		expect(inServings.get("kcal")).toBe(300);
	});

	test("a recipe without a yield is measured in servings", async () => {
		const batter = recipe({
			servings: 2,
			ingredients: [
				{ kind: "food", slug: "carrot", version: 1, amount: 100, unit: "g" },
			],
		});
		const { nutrition } = setup({ recipes: { batter: [batter] } });

		const half = await nutrition.sumOf([
			{
				kind: "recipe",
				slug: "batter",
				version: 1,
				amount: 0.5,
				unit: "serving",
			},
		]);

		expect(half.get("kcal")).toBe(10.25);
	});

	test("resolves several levels and calculates each recipe version once", async () => {
		const inner = recipe({
			ingredients: [
				{ kind: "food", slug: "carrot", version: 1, amount: 100, unit: "g" },
			],
		});
		const middle = recipe({
			ingredients: [
				{
					kind: "recipe",
					slug: "inner",
					version: 1,
					amount: 1,
					unit: "serving",
				},
				{
					kind: "recipe",
					slug: "inner",
					version: 1,
					amount: 1,
					unit: "serving",
				},
			],
		});
		const { nutrition, store } = setup({
			recipes: { inner: [inner], middle: [middle] },
		});
		let innerReads = 0;
		const counting = createNutrition({
			catalog: createCatalog({
				store: {
					...store,
					readRecipe: (slug) => {
						if (slug === "inner") innerReads++;
						return store.readRecipe(slug);
					},
				},
			}),
			config: createStaticConfigService(),
		});

		const total = await counting.sumOf([
			{
				kind: "recipe",
				slug: "middle",
				version: 1,
				amount: 1,
				unit: "serving",
			},
			{ kind: "recipe", slug: "inner", version: 1, amount: 1, unit: "serving" },
		]);

		expect(total.get("kcal")).toBe(123);
		expect(innerReads).toBe(1);
		expect((await nutrition.sumOf(middle.ingredients)).get("kcal")).toBe(82);
	});

	test("reports an unknown ingredient in a saved recipe with the recipe", async () => {
		const broken = recipe({
			ingredients: [
				{ kind: "food", slug: "unicorn", version: 1, amount: 1, unit: "g" },
			],
		});
		const { nutrition } = setup({ recipes: { broken: [broken] } });

		await expect(
			nutrition.sumOf([
				{
					kind: "recipe",
					slug: "broken",
					version: 1,
					amount: 1,
					unit: "serving",
				},
			]),
		).rejects.toThrow(
			"In recipe broken@1: 'unicorn' is neither a food nor a recipe",
		);
	});
});

describe("cycles", () => {
	const version = (other: string) =>
		parsedRecipe(
			[
				"---",
				"version: 1",
				"created: 2026-09-01T08:00:00+03:00",
				`name: ${other.toUpperCase()} inside`,
				"servings: 1",
				"ingredients:",
				`  - recipe: ${other}`,
				"    version: 1",
				"    amount: 1",
				"    unit: serving",
				"",
			].join("\n"),
		);

	test("hand-written recipes that reference each other fail, naming both", async () => {
		const { nutrition } = setup({
			recipes: { a: version("b"), b: version("a") },
		});

		for (const slug of ["a", "b"]) {
			const error = await nutrition
				.sumOf([
					{ kind: "recipe", slug, version: 1, amount: 1, unit: "serving" },
				])
				.catch((e) => e);
			const other = slug === "a" ? "b" : "a";

			expect(error.message).toBe(
				`Recipes reference each other in a cycle: ${slug}@1 -> ${other}@1 -> ${slug}@1`,
			);
		}
	});

	test("a recipe that references itself fails", async () => {
		const { nutrition } = setup({ recipes: { a: version("a") } });

		await expect(
			nutrition.sumOf([
				{ kind: "recipe", slug: "a", version: 1, amount: 1, unit: "serving" },
			]),
		).rejects.toThrow("a@1 -> a@1");
	});
});
