import { describe, expect, test } from "bun:test";
import { NomnomError, type RecipeUpdated } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createRecipeServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { recipeAdd } from "./recipe-add";
import { recipeUpdate } from "./recipe-update";

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

const soup = {
	version: 2,
	created: "2026-09-29T20:10:00+03:00",
	name: "Chicken Soup",
	servings: 4,
	yield: { baseUnit: "g", amount: 1000 },
	units: new Map(),
	ingredients: [],
	archived: false,
};

const updated: RecipeUpdated = {
	slug: "chicken-soup",
	path: "/data/recipes/chicken-soup.yaml",
	recipe: soup,
	changes: [
		{
			kind: "removed",
			field: "ingredients",
			item: "carrot@1 2 medium carrot",
		},
		{ kind: "added", field: "ingredients", item: "carrot@2 2 medium carrot" },
	],
	perServing: nutrients([543 / 4, 93 / 4, 0, 0, 0]),
	perHundred: { unit: "g", nutrients: nutrients([54.3, 9.3, 0, 0, 0]) },
};

async function run(
	argv: string[],
	recipes = createRecipeServiceMock({ updated }),
) {
	const io = createCapturedIo();
	const code = await runCli({
		argv,
		commands: [recipeAdd, recipeUpdate],
		services: { recipes },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("recipe update does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: recipes.updateCalls };
}

describe("recipe update", () => {
	test("passes the slug and every value to the service, as recipe add does", async () => {
		const result = await run([
			"recipe",
			"update",
			"chicken-soup",
			"--name",
			"Chicken Soup",
			"--base-unit",
			"g",
			"--yield",
			"1000",
			"--servings",
			"4",
			"--ingredient",
			"carrot=2 medium carrot",
			"--units",
			"bowl=350",
		]);

		expect(result.err).toBe("");
		expect(result.calls).toEqual([
			{
				slug: "chicken-soup",
				input: {
					name: "Chicken Soup",
					ingredients: ["carrot=2 medium carrot"],
					servings: "4",
					baseUnit: "g",
					yield: "1000",
					units: ["bowl=350"],
				},
			},
		]);
	});

	test("prints the file, the changes and the new nutrients", async () => {
		const result = await run([
			"recipe",
			"update",
			"chicken-soup",
			"--name",
			"Chicken Soup",
			"--ingredient",
			"carrot=2 medium carrot",
		]);

		expect(result.code).toBe(0);
		expect(result.out).toBe(
			[
				"Updated /data/recipes/chicken-soup.yaml (version 2)",
				"  ingredients: removed carrot@1 2 medium carrot",
				"  ingredients: added carrot@2 2 medium carrot",
				"",
				"Per serving:",
				"  Energy         135.8 kcal",
				"  Protein         23.3 g",
				"  Fat              0.0 g",
				"  Carbohydrates    0.0 g",
				"  Fiber            0.0 g",
				"",
				"Per 100 g:",
				"  Energy         54.3 kcal",
				"  Protein         9.3 g",
				"  Fat             0.0 g",
				"  Carbohydrates   0.0 g",
				"  Fiber           0.0 g",
				"",
			].join("\n"),
		);
	});

	test("after a rename, prints the created file and the archived one", async () => {
		const { perHundred: _, ...withoutYield } = updated;
		const renamed: RecipeUpdated = {
			...withoutYield,
			slug: "chicken-noodle-soup",
			path: "/data/recipes/chicken-noodle-soup.yaml",
			recipe: { ...soup, version: 1, name: "Chicken Noodle Soup" },
			archived: {
				slug: "chicken-soup",
				path: "/data/recipes/chicken-soup.yaml",
				recipe: { ...soup, version: 3, archived: true },
			},
			changes: [
				{
					kind: "changed",
					field: "name",
					before: "Chicken Soup",
					after: "Chicken Noodle Soup",
				},
			],
		};

		const result = await run(
			[
				"recipe",
				"update",
				"chicken-soup",
				"--name",
				"Chicken Noodle Soup",
				"--ingredient",
				"x=1",
			],
			createRecipeServiceMock({ updated: renamed }),
		);

		expect(result.out).toStartWith(
			[
				"Created /data/recipes/chicken-noodle-soup.yaml",
				"Archived /data/recipes/chicken-soup.yaml (version 3)",
				"  name: Chicken Soup -> Chicken Noodle Soup",
				"",
				"Per serving:",
			].join("\n"),
		);
		expect(result.out).not.toContain("Per 100");
	});

	test("reports service errors", async () => {
		const recipes = createRecipeServiceMock({
			error: new NomnomError(
				"A recipe can't contain itself: 'chicken-soup@1=1 serving' references 'chicken-soup'",
			),
		});

		const result = await run(
			["recipe", "update", "chicken-soup", "--name", "X"],
			recipes,
		);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: "error: A recipe can't contain itself: 'chicken-soup@1=1 serving' references 'chicken-soup'\n",
		});
	});

	test("help lists the same options as recipe add", async () => {
		const add = await run(["recipe", "add", "--help"]);
		const update = await run(["recipe", "update", "--help"]);

		const options = (help: string) => help.slice(help.indexOf("Options:"));
		expect(update.out).toContain(
			"Usage: nomnom recipe update <slug> [options]",
		);
		expect(options(update.out)).toBe(options(add.out));
		expect(options(update.out)).toContain("--ingredient <ref=amount [unit]>");
	});

	test("a dry run prints the update in the conditional, the changes and the nutrients", async () => {
		const args = [
			"recipe",
			"update",
			"chicken-soup",
			"--name",
			"Chicken Soup",
			"--ingredient",
			"carrot=2 medium carrot",
		];

		const real = await run(args);
		const dry = await run([...args, "--dry-run"]);

		expect(dry.code).toBe(0);
		expect(dry.out).toBe(
			`${real.out.replace("Updated", "Would update")}\nDry run: no files were changed.\n`,
		);
		expect(dry.out).toStartWith(
			"Would update /data/recipes/chicken-soup.yaml (version 2)\n  ingredients:",
		);
		expect(dry.out).toContain("Per serving:");
	});
});
