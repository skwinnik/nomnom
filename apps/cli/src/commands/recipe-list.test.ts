import { describe, expect, test } from "bun:test";
import { createCapturedIo } from "../__mocks__/io";
import { createRecipeServiceMock } from "../__mocks__/services";
import { runCli } from "../runner";
import { recipeList } from "./recipe-list";

async function run(recipes = createRecipeServiceMock()) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["recipe", "list"],
		commands: [recipeList],
		services: { recipes },
		io,
		resolveContext: () => {
			throw new Error("recipe list does not need the context");
		},
	});
	return { code, out: io.out, err: io.err };
}

describe("recipe list", () => {
	test("prints one aligned line per recipe", async () => {
		const recipes = createRecipeServiceMock({
			list: [
				{
					kind: "recipe",
					slug: "chicken-soup",
					version: 1,
					name: "Chicken Soup",
				},
				{ kind: "recipe", slug: "pancakes", version: 3, name: "Pancakes" },
			],
		});

		expect(await run(recipes)).toEqual({
			code: 0,
			out: [
				"chicken-soup@1  recipe  Chicken Soup",
				"pancakes@3      recipe  Pancakes",
				"",
			].join("\n"),
			err: "",
		});
	});

	test("prints No recipes when there are none", async () => {
		expect(await run()).toEqual({ code: 0, out: "No recipes\n", err: "" });
	});
});
