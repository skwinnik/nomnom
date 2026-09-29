import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { createFixedClock } from "../clock/__mocks__/clock";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import type { FoodVersion, RecipeVersion } from "../store/records";
import { createVersionedStore } from "../store/versioned-store";
import { createSearchService } from "./search-service";

function setup(items: {
	foods?: Record<string, FoodVersion[]>;
	recipes?: Record<string, RecipeVersion[]>;
}) {
	return createSearchService({
		catalog: createCatalog({ store: createFakeStore(items) }),
	});
}

async function slugsFor(
	query: string,
	items: Parameters<typeof setup>[0],
): Promise<string[]> {
	const results = await setup(items).search(query);
	return results.map((item) => item.slug);
}

describe("search", () => {
	test("finds foods and recipes together by their latest version", async () => {
		const search = setup({
			foods: {
				"greek-yogurt-2-4601234567890": [
					food({ name: "Greek Yogurt 2%", barcodes: ["4601234567890"] }),
				],
				apple: [food({ name: "Apple" })],
			},
			recipes: {
				"yogurt-bowl": [
					recipe({ name: "Bowl" }),
					recipe({ name: "Yogurt Bowl", version: 2 }),
				],
			},
		});

		expect(await search.search("yogurt")).toEqual([
			{
				kind: "food",
				slug: "greek-yogurt-2-4601234567890",
				version: 1,
				name: "Greek Yogurt 2%",
			},
			{ kind: "recipe", slug: "yogurt-bowl", version: 2, name: "Yogurt Bowl" },
		]);
	});

	test("puts closer matches first", async () => {
		expect(
			await slugsFor("apple", {
				foods: {
					"ample-bars": [food({ name: "Ample Bars" })],
					apple: [food({ name: "Apple" })],
				},
			}),
		).toEqual(["apple", "ample-bars"]);
	});

	test("orders ties by slug", async () => {
		expect(
			await slugsFor("rice", {
				foods: {
					rice: [food({ name: "Rice" })],
					"brown-rice": [food({ name: "Brown Rice" })],
				},
			}),
		).toEqual(["brown-rice", "rice"]);
	});

	test("leaves archived items out", async () => {
		expect(
			await slugsFor("rice", {
				foods: {
					rice: [food({ name: "Rice" }), food({ version: 2, archived: true })],
				},
				recipes: {
					"rice-bowl": [
						recipe({ name: "Rice Bowl" }),
						recipe({ name: "Rice Bowl", version: 2, archived: true }),
					],
				},
			}),
		).toEqual([]);
	});

	test("searches names only, not slugs or barcodes", async () => {
		const foods = {
			"greek-yogurt-2-4601234567890": [
				food({ name: "Greek Yogurt 2%", barcodes: ["4601234567890"] }),
			],
			"old-slug": [food({ name: "Kefir" })],
		};

		expect(await slugsFor("4601234567890", { foods })).toEqual([]);
		expect(await slugsFor("old", { foods })).toEqual([]);
	});

	test("returns nothing when nothing matches", async () => {
		expect(
			await slugsFor("xyz", { foods: { apple: [food({ name: "Apple" })] } }),
		).toEqual([]);
	});

	test("rejects a query without letters or digits", async () => {
		const error = await setup({})
			.search("%%")
			.catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe(
			"The search '%%' has no letters or digits to search for",
		);
	});

	test("a broken file fails the search, naming it", async () => {
		const store = createVersionedStore({
			fs: createMemoryFileSystem({ "/data/recipes/stew.yaml": "version: [" }),
			clock: createFixedClock(new Date("2026-09-29T17:10:00Z")),
			paths: dataPaths("/data"),
		});
		const search = createSearchService({ catalog: createCatalog({ store }) });

		await expect(search.search("soup")).rejects.toThrow(
			"/data/recipes/stew.yaml",
		);
	});

	test("a slug that is both a food and a recipe fails the search", async () => {
		const search = setup({
			foods: { pancakes: [food({ name: "Pancakes" })] },
			recipes: { pancakes: [recipe({ name: "Pancakes" })] },
		});

		await expect(search.search("soup")).rejects.toThrow(
			"'pancakes' is both a food and a recipe",
		);
	});
});
