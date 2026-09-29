import { expect, test } from "bun:test";
import { dataPaths } from "./paths";

const paths = dataPaths("/home/user/.nomnom");

test("config, folders and item files live under the data directory", () => {
	expect(paths.root).toBe("/home/user/.nomnom");
	expect(paths.config).toBe("/home/user/.nomnom/config.yaml");
	expect(paths.foods).toBe("/home/user/.nomnom/foods");
	expect(paths.recipes).toBe("/home/user/.nomnom/recipes");
	expect(paths.logs).toBe("/home/user/.nomnom/logs");
	expect(paths.food("apple")).toBe("/home/user/.nomnom/foods/apple.yaml");
	expect(paths.recipe("chicken-soup")).toBe(
		"/home/user/.nomnom/recipes/chicken-soup.yaml",
	);
});

test("a day file is logs/<yyyy>/<yyyy-mm-dd>.nom", () => {
	expect(paths.day("2026-09-29")).toBe(
		"/home/user/.nomnom/logs/2026/2026-09-29.nom",
	);
});
