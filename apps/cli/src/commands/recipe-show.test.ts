import { describe, expect, test } from "bun:test";
import { NomnomError, type RecipeShown } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createRecipeServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { recipeShow } from "./recipe-show";

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

const soup: RecipeShown = {
	slug: "chicken-soup",
	recipe: {
		version: 1,
		created: "2026-09-29T20:10:00+03:00",
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
			{ kind: "food", slug: "water", version: 1, amount: 700, unit: "ml" },
		],
		archived: false,
	},
	latestVersion: 1,
	archived: false,
	units: [
		{ name: "g", size: 1 },
		{ name: "serving", size: 250 },
		{ name: "bowl", size: 350 },
	],
	perServing: nutrients([545.02 / 4, 93 / 4, 0, 0, 0]),
	perHundred: { unit: "g", nutrients: nutrients([54.502, 9.3, 0, 0, 0]) },
};

async function run(args: string[], shown: RecipeShown = soup) {
	const recipes = createRecipeServiceMock({ shown });
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["recipe", "show", ...args],
		commands: [recipeShow],
		services: { recipes },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("recipe show does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: recipes.showCalls };
}

describe("recipe show", () => {
	test("prints a recipe with a yield as the spec shows it", async () => {
		const result = await run(["chicken-soup"]);

		expect(result).toEqual({
			code: 0,
			out: [
				"chicken-soup@1  recipe  Chicken Soup",
				"Created: 2026-09-29T20:10:00+03:00",
				"Servings: 4",
				"Yield: 1000 g",
				"Units:",
				"  g        base unit",
				"  serving  250 g",
				"  bowl     350 g",
				"Ingredients:",
				"  chicken-breast@2  300 g",
				"  carrot@1          2 medium carrot",
				"  water@1           700 ml",
				"Per serving:",
				"  Energy         136.3 kcal",
				"  Protein         23.3 g",
				"  Fat              0.0 g",
				"  Carbohydrates    0.0 g",
				"  Fiber            0.0 g",
				"Per 100 g:",
				"  Energy         54.5 kcal",
				"  Protein         9.3 g",
				"  Fat             0.0 g",
				"  Carbohydrates   0.0 g",
				"  Fiber           0.0 g",
				"",
			].join("\n"),
			err: "",
			calls: ["chicken-soup"],
		});
	});

	test("a recipe without a yield has no Yield line, only serving, and per-serving nutrients", async () => {
		const { yield: _, ...withoutYield } = soup.recipe;
		const { perHundred: __, ...shown } = soup;

		const result = await run(["pancake-batter"], {
			...shown,
			slug: "pancake-batter",
			recipe: {
				...withoutYield,
				name: "Pancake Batter",
				servings: 2,
				units: new Map(),
			},
			units: [{ name: "serving" }],
		});

		expect(result.out).toStartWith(
			[
				"pancake-batter@1  recipe  Pancake Batter",
				"Created: 2026-09-29T20:10:00+03:00",
				"Servings: 2",
				"Units:",
				"  serving",
				"Ingredients:",
				"",
			].join("\n"),
		);
		expect(result.out).not.toContain("Yield");
		expect(result.out).toContain("Per serving:");
		expect(result.out).not.toContain("Per 100");
	});

	test("an older version names the latest version, and an archived one says so", async () => {
		const result = await run(["pancakes@1"], {
			...soup,
			latestVersion: 3,
			archived: true,
		});

		expect(result.calls).toEqual(["pancakes@1"]);
		expect(result.out).toContain(
			"Created: 2026-09-29T20:10:00+03:00\nLatest version: 3\nArchived: yes\nServings: 4\n",
		);
	});

	test("rounds a calculated serving size to one decimal place", async () => {
		const result = await run(["chicken-soup"], {
			...soup,
			units: [
				{ name: "g", size: 1 },
				{ name: "serving", size: 1000 / 3 },
			],
		});

		expect(result.out).toContain("  serving  333.3 g\n");
	});

	test("reports service errors", async () => {
		const recipes = createRecipeServiceMock({
			error: new NomnomError(
				"Recipes reference each other in a cycle: a@1 -> b@1 -> a@1",
			),
		});
		const io = createCapturedIo();

		const code = await runCli({
			argv: ["recipe", "show", "a"],
			commands: [recipeShow],
			services: { recipes },
			io,
			writes: createWritesMock(),
			resolveContext: () => {
				throw new Error("unused");
			},
		});

		expect(code).toBe(1);
		expect(io.out).toBe("");
		expect(io.err).toBe(
			"error: Recipes reference each other in a cycle: a@1 -> b@1 -> a@1\n",
		);
	});

	test("needs a recipe", async () => {
		const result = await run([]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("missing argument <recipe>");
	});
});
