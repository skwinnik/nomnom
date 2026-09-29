import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { unitTable } from "../catalog/units";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { createNutrition } from "../nutrition/nutrition";
import { food, recipe } from "../store/__mocks__/versioned-store";
import type { FoodVersion, RecipeVersion } from "../store/records";
import { createVersionedStore } from "../store/versioned-store";
import { serialiseFood, serialiseRecipe } from "../store/write";
import { createRecipeService, type RecipeAddInput } from "./recipe-service";

const foods: Record<string, FoodVersion[]> = {
	"chicken-breast": [
		food({ nutrients: { kcal: 120 } }),
		food({ version: 2, nutrients: { kcal: 165, protein: 31 } }),
	],
	carrot: [
		food({ nutrients: { kcal: 41 }, units: { "medium carrot": 61 } }),
		food({
			version: 2,
			nutrients: { kcal: 40 },
			units: { "medium carrot": 60 },
		}),
	],
	water: [food({ baseUnit: "ml", nutrients: { kcal: 0 } })],
	rice: [food({ nutrients: { kcal: 360 } })],
	pear: [food(), food({ version: 2, archived: true })],
	pancakes: [food()],
};
const recipes: Record<string, RecipeVersion[]> = {
	"pancake-batter": [
		recipe({
			servings: 2,
			ingredients: [
				{ kind: "food", slug: "rice", version: 1, amount: 100, unit: "g" },
			],
		}),
	],
	broken: [
		recipe({
			ingredients: [
				{ kind: "food", slug: "unicorn", version: 1, amount: 1, unit: "g" },
			],
		}),
	],
};

function setup() {
	const files: Record<string, string> = {};
	for (const [slug, versions] of Object.entries(foods)) {
		files[`/data/foods/${slug}.yaml`] = versions.map(serialiseFood).join("");
	}
	for (const [slug, versions] of Object.entries(recipes)) {
		files[`/data/recipes/${slug}.yaml`] = versions
			.map(serialiseRecipe)
			.join("");
	}
	const fs = createMemoryFileSystem(files);
	const store = createVersionedStore({
		fs,
		clock: createFixedClock(new Date("2026-09-29T17:10:00Z")),
		paths: dataPaths("/data"),
	});
	const config = createStaticConfigService();
	const catalog = createCatalog({ store });
	const service = createRecipeService({
		config,
		catalog,
		nutrition: createNutrition({ catalog, config }),
		store,
	});
	const add = (input: Partial<RecipeAddInput>) =>
		service.add({ name: "Dish", ingredients: ["rice=80"], ...input });
	const created = () => [...fs.files.keys()].filter((path) => !(path in files));
	return { fs, add, created };
}

const soup: Partial<RecipeAddInput> = {
	name: "Chicken Soup",
	baseUnit: "g",
	yield: "1000",
	servings: "4",
	ingredients: [
		"chicken-breast=300 g",
		"carrot@1=2 medium carrot",
		"water=700 ml",
	],
};

async function rejection(promise: Promise<unknown>): Promise<NomnomError> {
	const error: unknown = await promise.catch((e) => e);
	expect(error).toBeInstanceOf(NomnomError);
	return error as NomnomError;
}

describe("recipe add", () => {
	test("writes the file described by the spec, pinning the latest versions", async () => {
		const { fs, add } = setup();

		const added = await add({
			name: "Chicken Soup",
			baseUnit: "g",
			yield: "1000",
			servings: "4",
			ingredients: ["chicken-breast=300 g", "carrot=2 medium carrot"],
		});

		expect(added.path).toBe("/data/recipes/chicken-soup.yaml");
		const text = fs.files.get(added.path) ?? "";
		expect(text).toStartWith("---\nversion: 1\ncreated: ");
		expect(text).toContain(
			[
				"name: Chicken Soup",
				"servings: 4",
				"base_unit: g",
				"yield: 1000",
				"ingredients:",
				"  - food: chicken-breast",
				"    version: 2",
				"    amount: 300",
				"    unit: g",
				"  - food: carrot",
				"    version: 2",
				"    amount: 2",
				"    unit: medium carrot",
				"",
			].join("\n"),
		);
		expect(text).not.toContain("kcal");
	});

	test("calculates the soup example per serving and per 100 g", async () => {
		const { add } = setup();

		const added = await add(soup);

		const kcal = (list: { id: string; value: number }[] = []) =>
			list.find((n) => n.id === "kcal")?.value;
		expect(kcal(added.perServing)).toBeCloseTo(136.255, 10);
		expect(added.perHundred?.unit).toBe("g");
		expect(kcal(added.perHundred?.nutrients)).toBeCloseTo(54.502, 10);
	});

	test("lists every catalog nutrient in catalog order, zeros included", async () => {
		const { add } = setup();

		const added = await add(soup);

		expect(added.perServing.map((n) => [n.id, n.name, n.unit])).toEqual([
			["kcal", "Energy", "kcal"],
			["protein", "Protein", "g"],
			["fat", "Fat", "g"],
			["carbs", "Carbohydrates", "g"],
			["fiber", "Fiber", "g"],
		]);
		expect(added.perServing.find((n) => n.id === "fiber")?.value).toBe(0);
	});

	test("keeps an explicit version", async () => {
		const { add } = setup();

		const { recipe: saved } = await add({
			ingredients: ["carrot@1=2 medium carrot"],
		});

		expect(saved.ingredients[0]?.version).toBe(1);
	});

	test("stores the default unit when none is given", async () => {
		const { add } = setup();

		const { recipe: saved } = await add({ ingredients: ["rice=80"] });

		expect(saved.ingredients).toEqual([
			{ kind: "food", slug: "rice", version: 1, amount: 80, unit: "g" },
		]);
	});

	test("stores a nested recipe without a yield in servings", async () => {
		const { add } = setup();

		const given = await add({
			name: "A",
			ingredients: ["pancake-batter=0.5 serving"],
		});
		const implied = await add({
			name: "B",
			ingredients: ["pancake-batter=0.5"],
		});

		for (const { recipe: saved } of [given, implied]) {
			expect(saved.ingredients).toEqual([
				{
					kind: "recipe",
					slug: "pancake-batter",
					version: 1,
					amount: 0.5,
					unit: "serving",
				},
			]);
		}
		// Half a serving of a two-serving batter of 100 g rice.
		expect(given.perServing[0]?.value).toBe(90);
	});

	test("a recipe with a yield allows its base unit, serving and its units", async () => {
		const { add } = setup();

		const { slug, recipe: saved } = await add({ ...soup, units: ["bowl=350"] });

		expect([...unitTable({ kind: "recipe", slug, record: saved })]).toEqual([
			["g", 1],
			["serving", 250],
			["bowl", 350],
		]);
	});

	test("a recipe without a yield allows only serving", async () => {
		const { add } = setup();

		const { slug, recipe: saved, perHundred } = await add({ servings: "2" });

		expect([
			...unitTable({ kind: "recipe", slug, record: saved }).keys(),
		]).toEqual(["serving"]);
		expect(saved.servings).toBe(2);
		expect(perHundred).toBeUndefined();
	});

	test("servings default to 1", async () => {
		const { add, created } = setup();

		expect((await add({})).recipe.servings).toBe(1);
		expect(created()).toEqual(["/data/recipes/dish.yaml"]);
	});

	test.each([
		["no ingredients", { ingredients: [] }, "at least one --ingredient"],
		[
			"a yield without a base unit",
			{ yield: "1000" },
			"--yield and --base-unit must be given together",
		],
		[
			"a base unit without a yield",
			{ baseUnit: "g" },
			"--yield and --base-unit must be given together",
		],
		["units without a yield", { units: ["bowl=350"] }, "Units need a yield"],
		[
			"a unit named serving",
			{ units: ["serving=300"] },
			"'serving' is reserved",
		],
		[
			"a base unit named serving",
			{ baseUnit: "serving", yield: "4" },
			"'serving' is reserved",
		],
		[
			"a version that does not exist",
			{ ingredients: ["carrot@7=2"] },
			"'carrot@7' does not exist",
		],
		[
			"an unknown reference",
			{ ingredients: ["unicorn=1"] },
			"'unicorn' is neither a food nor a recipe",
		],
		[
			"a unit the version does not allow",
			{ ingredients: ["carrot=2 cup"] },
			"'cup' is not a unit of carrot@2; it allows 'g', 'medium carrot'",
		],
		["an archived item", { ingredients: ["pear@1=100"] }, "'pear' is archived"],
		[
			"a slug used by a food",
			{ name: "Pancakes" },
			"'pancakes' already exists: it is already used by a food",
		],
		[
			"zero servings",
			{ servings: "0" },
			"'servings' must be a positive number",
		],
		[
			"an ingredient that is not a reference",
			{ ingredients: ["rice"] },
			"Expected <name>[@<version>]=<amount>",
		],
		[
			"nutrients that can't be calculated",
			{ ingredients: ["broken=1"] },
			"In recipe broken@1: 'unicorn' is neither a food nor a recipe",
		],
	])("rejects %s without writing", async (_name, input, message) => {
		const { add, created } = setup();

		const error = await rejection(add(input));

		expect(error.message).toContain(message);
		expect(created()).toEqual([]);
	});
});
