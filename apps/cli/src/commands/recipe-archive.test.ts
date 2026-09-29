import { describe, expect, test } from "bun:test";
import { NomnomError, type RecipeArchived } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createRecipeServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { recipeArchive } from "./recipe-archive";
import { recipeUnarchive } from "./recipe-unarchive";

const archived: RecipeArchived = {
	slug: "chicken-soup",
	path: "/data/recipes/chicken-soup.yaml",
	recipe: {
		version: 2,
		created: "2026-09-29T20:10:00+03:00",
		name: "Chicken Soup",
		servings: 4,
		units: new Map(),
		ingredients: [],
		archived: true,
	},
};

async function run(
	argv: string[],
	recipes = createRecipeServiceMock({ archived }),
) {
	const io = createCapturedIo();
	const code = await runCli({
		argv,
		commands: [recipeArchive, recipeUnarchive],
		services: { recipes },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("archiving does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: recipes.archiveCalls };
}

describe("recipe archive and unarchive", () => {
	test("archive prints the file and the new version", async () => {
		const result = await run(["recipe", "archive", "chicken-soup"]);

		expect(result).toMatchObject({
			code: 0,
			out: "Archived /data/recipes/chicken-soup.yaml (version 2)\n",
			err: "",
			calls: ["archive chicken-soup"],
		});
	});

	test("unarchive prints the file and the new version", async () => {
		const result = await run(["recipe", "unarchive", "chicken-soup"]);

		expect(result).toMatchObject({
			code: 0,
			out: "Unarchived /data/recipes/chicken-soup.yaml (version 2)\n",
			calls: ["unarchive chicken-soup"],
		});
	});

	test("reports service errors", async () => {
		const recipes = createRecipeServiceMock({
			error: new NomnomError("'apple' is a food, not a recipe"),
		});

		const result = await run(["recipe", "unarchive", "apple"], recipes);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: "error: 'apple' is a food, not a recipe\n",
		});
	});

	test("a dry run prints archive and unarchive in the conditional", async () => {
		const archive = await run([
			"recipe",
			"archive",
			"chicken-soup",
			"--dry-run",
		]);
		const unarchive = await run([
			"recipe",
			"unarchive",
			"chicken-soup",
			"--dry-run",
		]);

		expect(archive).toMatchObject({
			code: 0,
			out: "Would archive /data/recipes/chicken-soup.yaml (version 2)\n\nDry run: no files were changed.\n",
			calls: ["archive chicken-soup"],
		});
		expect(unarchive).toMatchObject({
			code: 0,
			out: "Would unarchive /data/recipes/chicken-soup.yaml (version 2)\n\nDry run: no files were changed.\n",
			calls: ["unarchive chicken-soup"],
		});
	});
});
