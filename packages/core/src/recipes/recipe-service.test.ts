import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { unitTable } from "../catalog/units";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { createNutrition } from "../nutrition/nutrition";
import { localTimestamp } from "../shared/time";
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
	oats: [food({ nutrients: { kcal: 389, protien: 13 } })],
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

function setup(
	items: {
		foods?: Record<string, FoodVersion[]>;
		recipes?: Record<string, RecipeVersion[]>;
		files?: Record<string, string>;
	} = { foods, recipes },
) {
	const files: Record<string, string> = { ...items.files };
	for (const [slug, versions] of Object.entries(items.foods ?? {})) {
		files[`/data/foods/${slug}.yaml`] = versions.map(serialiseFood).join("");
	}
	for (const [slug, versions] of Object.entries(items.recipes ?? {})) {
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
	return { fs, add, created, service };
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
			"an unusable food version",
			{ ingredients: ["oats@1=100"] },
			"'oats@1' is unusable: 'protien' is not a nutrient in config.yaml",
		],
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

/** A valid recipe of 100 g rice. */
function dish(fields: Parameters<typeof recipe>[0] = {}): RecipeVersion {
	return recipe({
		ingredients: [
			{ kind: "food", slug: "rice", version: 1, amount: 100, unit: "g" },
		],
		...fields,
	});
}

const soupV1 = recipe({
	name: "Chicken Soup",
	servings: 4,
	yield: { baseUnit: "g", amount: 1000 },
	units: { bowl: 350 },
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
		{ kind: "food", slug: "water", version: 1, amount: 700, unit: "ml" },
	],
});

function showSetup() {
	return setup({
		foods,
		recipes: {
			...recipes,
			"chicken-soup": [soupV1, { ...soupV1, version: 2, servings: 5 }],
			stew: [dish({ name: "Stew" }), dish({ version: 2, archived: true })],
			a: [
				recipe({
					ingredients: [
						{
							kind: "recipe",
							slug: "b",
							version: 1,
							amount: 1,
							unit: "serving",
						},
					],
				}),
			],
			b: [
				recipe({
					ingredients: [
						{
							kind: "recipe",
							slug: "a",
							version: 1,
							amount: 1,
							unit: "serving",
						},
					],
				}),
			],
		},
	});
}

const kcal = (list: { id: string; value: number }[] = []) =>
	list.find((n) => n.id === "kcal")?.value;

describe("recipe list", () => {
	test("lists non-archived recipes by their latest version, in slug order", async () => {
		const { service } = setup({
			recipes: {
				pancakes: [
					dish({ name: "Old Pancakes" }),
					dish({ name: "Pancakes", version: 2 }),
					dish({ name: "Pancakes", version: 3 }),
				],
				"chicken-soup": [dish({ name: "Chicken Soup" })],
				stew: [dish({ name: "Stew" }), dish({ version: 2, archived: true })],
			},
		});

		expect(await service.list()).toEqual([
			{
				kind: "recipe",
				slug: "chicken-soup",
				version: 1,
				name: "Chicken Soup",
			},
			{ kind: "recipe", slug: "pancakes", version: 3, name: "Pancakes" },
		]);
	});

	test("is empty without recipes", async () => {
		const { service } = setup({});

		expect(await service.list()).toEqual([]);
	});

	test("never reads foods", async () => {
		const { service } = setup({
			recipes: { soup: [dish({ name: "Soup" })] },
			files: { "/data/foods/rice.yaml": "version: [" },
		});

		expect((await service.list()).map((item) => item.slug)).toEqual(["soup"]);
	});

	test("ignores other files and directories", async () => {
		const { service } = setup({
			recipes: { soup: [dish({ name: "Soup" })] },
			files: {
				"/data/recipes/notes.txt": "notes",
				"/data/recipes/old/stew.yaml": "version: [",
			},
		});

		expect((await service.list()).map((item) => item.slug)).toEqual(["soup"]);
	});

	test("a broken recipe file fails the list, naming it", async () => {
		const { service } = setup({
			recipes: { soup: [dish({ name: "Soup" })] },
			files: { "/data/recipes/stew.yaml": "version: [" },
		});

		const error = await rejection(service.list());

		expect(error.message).toContain("/data/recipes/stew.yaml");
	});
});

describe("recipe show", () => {
	test("shows the soup example with its units and nutrients", async () => {
		const { service } = showSetup();

		const shown = await service.show("chicken-soup@1");

		expect(shown.slug).toBe("chicken-soup");
		expect(shown.recipe).toEqual(soupV1);
		expect(shown.latestVersion).toBe(2);
		expect(shown.archived).toBe(false);
		expect(shown.units).toEqual([
			{ name: "g", size: 1 },
			{ name: "serving", size: 250 },
			{ name: "bowl", size: 350 },
		]);
		expect(shown.perServing.map((n) => n.id)).toEqual([
			"kcal",
			"protein",
			"fat",
			"carbs",
			"fiber",
		]);
		expect(kcal(shown.perServing)).toBeCloseTo(136.255, 10);
		expect(shown.perHundred?.unit).toBe("g");
		expect(kcal(shown.perHundred?.nutrients)).toBeCloseTo(54.502, 10);
	});

	test("shows the latest version by default", async () => {
		const { service } = showSetup();

		const shown = await service.show("chicken-soup");

		expect(shown.recipe.version).toBe(2);
		expect(shown.latestVersion).toBe(2);
		expect(kcal(shown.perServing)).toBeCloseTo(545.02 / 5, 10);
	});

	test("a recipe without a yield allows only serving and has no per-100 values", async () => {
		const { service } = showSetup();

		const shown = await service.show("pancake-batter");

		expect(shown.units).toEqual([{ name: "serving" }]);
		expect(shown.perHundred).toBeUndefined();
		// 100 g rice in two servings.
		expect(kcal(shown.perServing)).toBe(180);
	});

	test("shows an archived recipe", async () => {
		const { service } = showSetup();

		expect((await service.show("stew")).archived).toBe(true);
		expect((await service.show("stew@1")).archived).toBe(true);
	});

	test("a food's slug is not found, like an unknown slug", async () => {
		const { service } = showSetup();

		expect((await rejection(service.show("rice"))).message).toBe(
			"There is no recipe 'rice'",
		);
		expect((await rejection(service.show("unicorn"))).message).toBe(
			"There is no recipe 'unicorn'",
		);
	});

	test("rejects a version that does not exist, naming it", async () => {
		const { service } = showSetup();

		expect((await rejection(service.show("chicken-soup@7"))).message).toBe(
			"'chicken-soup@7' does not exist: recipe 'chicken-soup' has versions 1 to 2",
		);
	});

	test("fails when a stored ingredient became unusable, naming the version, the ingredient and the nutrient", async () => {
		const { service } = setup({
			foods: { carrot: [food({ nutrients: { protein: 1 } })] },
			recipes: {
				soup: [
					recipe({
						ingredients: [
							{
								kind: "food",
								slug: "carrot",
								version: 1,
								amount: 100,
								unit: "g",
							},
						],
					}),
				],
			},
		});

		expect((await rejection(service.show("soup"))).message).toBe(
			"In recipe soup@1: 'carrot@1' is unusable: the required nutrient 'kcal' is missing",
		);
	});

	test("fails when the nutrients can't be calculated, naming the cycle", async () => {
		const { service } = showSetup();

		expect((await rejection(service.show("a"))).message).toBe(
			"Recipes reference each other in a cycle: a@1 -> b@1 -> a@1",
		);
	});
});

/** The options that give `soupV1` again, with the latest carrot unless pinned. */
const soupInput = (
	fields: Partial<RecipeAddInput> = {},
	carrot = "carrot@1=2 medium carrot",
): RecipeAddInput => ({
	name: "Chicken Soup",
	servings: "4",
	baseUnit: "g",
	yield: "1000",
	units: ["bowl=350"],
	ingredients: ["chicken-breast=300 g", carrot, "water=700 ml"],
	...fields,
});

/** A recipe that pins `chicken-soup@1`. */
const lunch = recipe({
	name: "Lunch",
	ingredients: [
		{
			kind: "recipe",
			slug: "chicken-soup",
			version: 1,
			amount: 1,
			unit: "serving",
		},
	],
});

function soupSetup(
	items: {
		foods?: Record<string, FoodVersion[]>;
		recipes?: Record<string, RecipeVersion[]>;
	} = {},
) {
	const result = setup({
		foods: { ...foods, ...items.foods },
		recipes: { "chicken-soup": [soupV1], lunch: [lunch], ...items.recipes },
	});
	const soupFile = result.fs.files.get("/data/recipes/chicken-soup.yaml") ?? "";
	const lunchFile = result.fs.files.get("/data/recipes/lunch.yaml") ?? "";
	return { ...result, soupFile, lunchFile };
}

describe("recipe update", () => {
	test("re-listed ingredients pin their latest versions", async () => {
		const { fs, service, soupFile, lunchFile } = soupSetup();

		const updated = await service.update(
			"chicken-soup",
			soupInput({}, "carrot=2 medium carrot"),
		);

		expect(updated.slug).toBe("chicken-soup");
		expect(updated.path).toBe("/data/recipes/chicken-soup.yaml");
		expect(updated.archived).toBeUndefined();
		expect(updated.recipe.version).toBe(2);
		expect(updated.recipe.ingredients[1]).toMatchObject({
			slug: "carrot",
			version: 2,
		});
		expect(updated.changes).toEqual([
			{
				kind: "removed",
				field: "ingredients",
				item: "carrot@1 2 medium carrot",
			},
			{
				kind: "added",
				field: "ingredients",
				item: "carrot@2 2 medium carrot",
			},
		]);
		// 300 g chicken (495 kcal) and 120 g carrot (48 kcal) in 4 servings.
		expect(kcal(updated.perServing)).toBeCloseTo(543 / 4, 10);
		expect(updated.perHundred?.unit).toBe("g");
		expect(fs.files.get(updated.path)).toStartWith(soupFile);
		expect(fs.files.get("/data/recipes/lunch.yaml")).toBe(lunchFile);
	});

	test("keeps an explicit older version", async () => {
		const { service } = soupSetup();

		const { recipe: saved } = await service.update(
			"chicken-soup",
			soupInput({ servings: "5" }),
		);

		expect(saved.ingredients[1]).toMatchObject({ slug: "carrot", version: 1 });
	});

	test("rejects an archived ingredient without writing", async () => {
		const { fs, service, soupFile } = soupSetup({
			foods: {
				carrot: [...(foods.carrot ?? []), food({ version: 3, archived: true })],
			},
		});

		const error = await rejection(
			service.update("chicken-soup", soupInput({ servings: "5" })),
		);

		expect(error.message).toBe(
			"'carrot' is archived and can't be newly referenced",
		);
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});

	test("rejects the recipe itself as an ingredient", async () => {
		const { fs, service, soupFile } = soupSetup();

		const error = await rejection(
			service.update(
				"chicken-soup",
				soupInput({ ingredients: ["chicken-soup@1=1 serving"] }),
			),
		);

		expect(error.message).toBe(
			"A recipe can't contain itself: 'chicken-soup@1=1 serving' references 'chicken-soup'",
		);
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});

	test("carries over no omitted yield", async () => {
		const { service } = soupSetup();

		const updated = await service.update(
			"chicken-soup",
			soupInput({ baseUnit: undefined, yield: undefined, units: [] }),
		);

		expect(updated.recipe.yield).toBeUndefined();
		expect([
			...unitTable({
				kind: "recipe",
				slug: updated.slug,
				record: updated.recipe,
			}).keys(),
		]).toEqual(["serving"]);
		expect(updated.perHundred).toBeUndefined();
		expect(updated.changes).toEqual([
			{ kind: "changed", field: "base_unit", before: "g" },
			{ kind: "changed", field: "yield", before: "1000" },
			{ kind: "changed", field: "units", key: "bowl", before: "350" },
		]);
	});

	test("a name change that keeps the slug adds to the same file", async () => {
		const { service } = soupSetup();

		const updated = await service.update(
			"chicken-soup",
			soupInput({ name: "Chicken soup" }),
		);

		expect(updated.path).toBe("/data/recipes/chicken-soup.yaml");
		expect(updated.recipe.version).toBe(2);
	});

	test("a rename creates a new file and archives the old recipe", async () => {
		const { fs, service, soupFile, lunchFile } = soupSetup();

		const updated = await service.update(
			"chicken-soup",
			soupInput({ name: "Chicken Noodle Soup" }),
		);

		expect(updated.slug).toBe("chicken-noodle-soup");
		expect(updated.path).toBe("/data/recipes/chicken-noodle-soup.yaml");
		expect(updated.recipe.version).toBe(1);
		expect(updated.archived).toEqual({
			slug: "chicken-soup",
			path: "/data/recipes/chicken-soup.yaml",
			recipe: {
				...soupV1,
				version: 2,
				created: localTimestamp(new Date("2026-09-29T17:10:00Z")),
				archived: true,
			},
		});
		expect(updated.changes).toEqual([
			{
				kind: "changed",
				field: "name",
				before: "Chicken Soup",
				after: "Chicken Noodle Soup",
			},
		]);
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toStartWith(
			soupFile,
		);
		expect(fs.files.get("/data/recipes/lunch.yaml")).toBe(lunchFile);
	});

	test("an identical update fails without writing", async () => {
		const { fs, service, soupFile } = soupSetup();

		const error = await rejection(service.update("chicken-soup", soupInput()));

		expect(error.message).toBe(
			"Nothing changed: the values are those of chicken-soup@1",
		);
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});

	test("an archived recipe fails without writing", async () => {
		const { created, service } = soupSetup({
			recipes: {
				"chicken-soup": [soupV1, { ...soupV1, version: 2, archived: true }],
			},
		});

		const error = await rejection(
			service.update("chicken-soup", soupInput({ name: "Soup" })),
		);

		expect(error.message).toBe(
			"'chicken-soup' is archived and must be unarchived first",
		);
		expect(created()).toEqual([]);
	});

	test("a food's slug fails, naming it a food", async () => {
		const { service } = soupSetup();

		const error = await rejection(service.update("rice", soupInput()));

		expect(error.message).toBe("'rice' is a food, not a recipe");
	});

	test("an unknown slug fails", async () => {
		const { created, service } = soupSetup();

		const error = await rejection(service.update("unicorn", soupInput()));

		expect(error.message).toBe("'unicorn' is neither a food nor a recipe");
		expect(created()).toEqual([]);
	});

	test("nutrients that can't be calculated fail as for recipe add", async () => {
		const { fs, service, soupFile } = soupSetup({
			recipes: {
				broken: [
					recipe({
						ingredients: [
							{
								kind: "food",
								slug: "unicorn",
								version: 1,
								amount: 1,
								unit: "g",
							},
						],
					}),
				],
			},
		});

		const error = await rejection(
			service.update("chicken-soup", soupInput({ ingredients: ["broken=1"] })),
		);

		expect(error.message).toContain("'unicorn' is neither a food nor a recipe");
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});
});

describe("recipe archive and unarchive", () => {
	const soupV2 = { ...soupV1, version: 2, servings: 5 };

	test("archive adds a copy of the latest version with its pins and archived: true", async () => {
		const { service, fs } = soupSetup({
			recipes: { "chicken-soup": [soupV1, soupV2] },
		});

		const archived = await service.archive("chicken-soup");

		expect(archived).toEqual({
			slug: "chicken-soup",
			path: "/data/recipes/chicken-soup.yaml",
			recipe: {
				...soupV2,
				version: 3,
				created: localTimestamp(new Date("2026-09-29T17:10:00Z")),
				archived: true,
			},
		});
		const store = createVersionedStore({
			fs,
			clock: createFixedClock(new Date()),
			paths: dataPaths("/data"),
		});
		const error = await rejection(
			createCatalog({ store }).resolve(
				{ slug: "chicken-soup" },
				{ newReference: true },
			),
		);
		expect(error.message).toBe(
			"'chicken-soup' is archived and can't be newly referenced",
		);
	});

	test("unarchive keeps a pin to an archived ingredient", async () => {
		const { service } = soupSetup({
			foods: {
				carrot: [...(foods.carrot ?? []), food({ version: 3, archived: true })],
			},
			recipes: {
				"chicken-soup": [soupV1, { ...soupV1, version: 2, archived: true }],
			},
		});

		const { recipe: saved } = await service.unarchive("chicken-soup");

		expect(saved.version).toBe(3);
		expect(saved.archived).toBe(false);
		expect(saved.ingredients).toEqual(soupV1.ingredients);
	});

	test("archiving an archived recipe fails without writing", async () => {
		const { fs, service, soupFile } = soupSetup({
			recipes: {
				"chicken-soup": [soupV1, { ...soupV1, version: 2, archived: true }],
			},
		});

		const error = await rejection(service.archive("chicken-soup"));

		expect(error.message).toBe("'chicken-soup' is already archived");
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});

	test("unarchiving a recipe that is not archived fails without writing", async () => {
		const { fs, service, soupFile } = soupSetup();

		const error = await rejection(service.unarchive("chicken-soup"));

		expect(error.message).toBe("'chicken-soup' is not archived");
		expect(fs.files.get("/data/recipes/chicken-soup.yaml")).toBe(soupFile);
	});

	test("a food's slug fails, naming it a food", async () => {
		const { service } = soupSetup();

		expect((await rejection(service.archive("rice"))).message).toBe(
			"'rice' is a food, not a recipe",
		);
		expect((await rejection(service.unarchive("rice"))).message).toBe(
			"'rice' is a food, not a recipe",
		);
	});
});
