import { describe, expect, test } from "bun:test";
import { NomnomError, type RecipeAdded } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createRecipeServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { recipeAdd } from "./recipe-add";

const nutrients = (values: [number, number, number, number, number]) =>
	(
		[
			["kcal", "Energy", "kcal"],
			["protein", "Protein", "g"],
			["fat", "Fat", "g"],
			["carbs", "Carbohydrates", "g"],
			["fiber", "Fiber", "g"],
		] as const
	).map(([id, name, unit], i) => ({ id, name, unit, value: values[i] ?? 0 }));

/** The soup example: 545.02 kcal and 93 g protein in 1000 g, 4 servings. */
const soup: RecipeAdded = {
	slug: "chicken-soup",
	path: "/data/recipes/chicken-soup.yaml",
	recipe: {
		version: 1,
		created: "2026-09-29T20:10:00+03:00",
		name: "Chicken Soup",
		servings: 4,
		yield: { baseUnit: "g", amount: 1000 },
		units: new Map(),
		ingredients: [],
		archived: false,
	},
	perServing: nutrients([545.02 / 4, 93 / 4, 0, 0, 0]),
	perHundred: { unit: "g", nutrients: nutrients([54.502, 9.3, 0, 0, 0]) },
};

async function run(
	args: string[],
	recipes = createRecipeServiceMock({ result: soup }),
) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["recipe", "add", ...args],
		commands: [recipeAdd],
		services: { recipes },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("recipe add does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: recipes.calls };
}

describe("recipe add", () => {
	test("passes every value to the service", async () => {
		const result = await run([
			"--name",
			"Chicken Soup",
			"--base-unit",
			"g",
			"--yield",
			"1000",
			"--servings",
			"4",
			"--ingredient",
			"chicken-breast=300 g",
			"--ingredient",
			"carrot@1=2 medium carrot",
			"--units",
			"bowl=350",
		]);

		expect(result.code).toBe(0);
		expect(result.calls).toEqual([
			{
				name: "Chicken Soup",
				ingredients: ["chicken-breast=300 g", "carrot@1=2 medium carrot"],
				servings: "4",
				baseUnit: "g",
				yield: "1000",
				units: ["bowl=350"],
			},
		]);
	});

	test("servings default to 1 and the yield is left out when not given", async () => {
		const result = await run([
			"--name",
			"Toast",
			"--ingredient",
			"bread=2 slice",
		]);

		expect(result.calls).toEqual([
			{
				name: "Toast",
				ingredients: ["bread=2 slice"],
				servings: "1",
				units: [],
			},
		]);
	});

	test("prints the path and nutrients per serving and per 100 base units", async () => {
		const result = await run(["--name", "Chicken Soup", "--ingredient", "x=1"]);

		expect(result.err).toBe("");
		expect(result.out).toBe(
			[
				"Created /data/recipes/chicken-soup.yaml",
				"",
				"Per serving:",
				"  Energy         136.3 kcal",
				"  Protein         23.3 g",
				"  Fat              0.0 g",
				"  Carbohydrates    0.0 g",
				"  Fiber            0.0 g",
				"",
				"Per 100 g:",
				"  Energy         54.5 kcal",
				"  Protein         9.3 g",
				"  Fat             0.0 g",
				"  Carbohydrates   0.0 g",
				"  Fiber           0.0 g",
				"",
			].join("\n"),
		);
	});

	test("prints only per-serving nutrients without a yield", async () => {
		const { perHundred: _, ...withoutYield } = soup;
		const recipes = createRecipeServiceMock({ result: withoutYield });

		const result = await run(
			["--name", "Soup", "--ingredient", "x=1"],
			recipes,
		);

		expect(result.out).toContain("Per serving:");
		expect(result.out).not.toContain("Per 100");
	});

	test.each([
		"'carrot@7' does not exist: food 'carrot' has versions 1 to 2",
		"'unicorn' is neither a food nor a recipe",
		"'cup' is not a unit of carrot@1; it allows 'g', 'medium carrot'",
		"--yield and --base-unit must be given together",
		"Units need a yield: give --yield and --base-unit too",
		"'serving' is reserved: every recipe has it as 1 / servings of the recipe",
		"A recipe needs at least one --ingredient",
		"'pancakes' already exists: it is already used by a food",
		"'pear' is archived and can't be newly referenced",
	])("reports the service error %j", async (message) => {
		const recipes = createRecipeServiceMock({
			error: new NomnomError(message),
		});

		const result = await run(["--name", "X"], recipes);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: `error: ${message}\n`,
		});
	});

	test("a dry run prints the path in the conditional and the nutrients", async () => {
		const args = ["--name", "Chicken Soup", "--ingredient", "x=1"];

		const real = await run(args);
		const dry = await run([...args, "--dry-run"]);

		expect(dry.code).toBe(0);
		expect(dry.calls).toEqual(real.calls);
		expect(dry.out).toBe(
			`${real.out.replace("Created", "Would create")}\nDry run: no files were changed.\n`,
		);
		expect(dry.out).toStartWith(
			"Would create /data/recipes/chicken-soup.yaml\n\nPer serving:\n",
		);
	});
});
