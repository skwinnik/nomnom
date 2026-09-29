import { describe, expect, test } from "bun:test";
import { food, recipe } from "./__mocks__/versioned-store";
import { diffFood, diffRecipe } from "./diff";
import type { Ingredient } from "./records";

const carrot = (version: number, amount = 2): Ingredient => ({
	kind: "food",
	slug: "carrot",
	version,
	amount,
	unit: "medium carrot",
});
const rice: Ingredient = {
	kind: "food",
	slug: "rice",
	version: 1,
	amount: 80,
	unit: "g",
};

describe("diffFood", () => {
	const apple = food({
		name: "Apple",
		per: 100,
		nutrients: { kcal: 52, protein: 0.3, fiber: 2.4 },
		units: { "small sized apple": 134 },
		barcodes: ["4600000000001"],
	});

	test("is empty for identical versions, ignoring version, created and archived", () => {
		const copy = {
			...apple,
			version: 7,
			created: "2026-09-30T08:00:00+03:00",
			archived: true,
		};

		expect(diffFood(apple, copy)).toEqual([]);
	});

	test("reports changed scalars with their values as text", () => {
		const next = { ...apple, name: "Green Apple", baseUnit: "ml", per: 1 };

		expect(diffFood(apple, next)).toEqual([
			{ kind: "changed", field: "name", before: "Apple", after: "Green Apple" },
			{ kind: "changed", field: "base_unit", before: "g", after: "ml" },
			{ kind: "changed", field: "per", before: "100", after: "1" },
		]);
	});

	test("compares nutrients and units by key regardless of order", () => {
		const next = food({
			...apple,
			nutrients: { fiber: 2.4, kcal: 55, fat: 0.2 },
			units: { "medium sized apple": 180 },
			barcodes: [...apple.barcodes],
		});

		expect(diffFood(apple, next)).toEqual([
			{
				kind: "changed",
				field: "nutrients",
				key: "kcal",
				before: "52",
				after: "55",
			},
			{ kind: "changed", field: "nutrients", key: "protein", before: "0.3" },
			{ kind: "changed", field: "nutrients", key: "fat", after: "0.2" },
			{
				kind: "changed",
				field: "units",
				key: "small sized apple",
				before: "134",
			},
			{
				kind: "changed",
				field: "units",
				key: "medium sized apple",
				after: "180",
			},
		]);
	});

	test("reports a nutrient no longer in the catalog as removed", () => {
		const before = food({ nutrients: { kcal: 52, sodium: 1 } });
		const after = food({ nutrients: { kcal: 52 } });

		expect(diffFood(before, after)).toEqual([
			{ kind: "changed", field: "nutrients", key: "sodium", before: "1" },
		]);
	});

	test("reports barcodes added and removed", () => {
		const next = { ...apple, barcodes: ["4600000000002", "4600000000003"] };

		expect(diffFood(apple, next)).toEqual([
			{ kind: "removed", field: "barcodes", item: "4600000000001" },
			{ kind: "added", field: "barcodes", item: "4600000000002" },
			{ kind: "added", field: "barcodes", item: "4600000000003" },
		]);
	});

	test("reports barcodes that differ only in order", () => {
		const before = { ...apple, barcodes: ["1", "2"] };
		const after = { ...apple, barcodes: ["2", "1"] };

		expect(diffFood(before, after)).toEqual([
			{ kind: "reordered", field: "barcodes" },
		]);
	});
});

describe("diffRecipe", () => {
	const soup = recipe({
		name: "Chicken Soup",
		servings: 4,
		yield: { baseUnit: "g", amount: 1000 },
		units: { bowl: 350 },
		ingredients: [carrot(1), rice],
	});

	test("is empty for identical versions", () => {
		expect(diffRecipe(soup, { ...soup, version: 2, archived: true })).toEqual(
			[],
		);
	});

	test("reports a recipe losing its yield and units", () => {
		const next = recipe({ ...soup, yield: undefined, units: {} });

		expect(diffRecipe(soup, next)).toEqual([
			{ kind: "changed", field: "base_unit", before: "g" },
			{ kind: "changed", field: "yield", before: "1000" },
			{ kind: "changed", field: "units", key: "bowl", before: "350" },
		]);
	});

	test("reports changed name and servings", () => {
		const next = { ...soup, name: "Soup", servings: 5 };

		expect(diffRecipe(soup, next)).toEqual([
			{ kind: "changed", field: "name", before: "Chicken Soup", after: "Soup" },
			{ kind: "changed", field: "servings", before: "4", after: "5" },
		]);
	});

	test("shows ingredients as slug@version amount unit", () => {
		const next = { ...soup, ingredients: [carrot(2), rice] };

		expect(diffRecipe(soup, next)).toEqual([
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
	});

	test("compares ingredients as a multiset", () => {
		const before = { ...soup, ingredients: [carrot(1), carrot(1), rice] };
		const after = { ...soup, ingredients: [carrot(1), rice] };

		expect(diffRecipe(before, after)).toEqual([
			{
				kind: "removed",
				field: "ingredients",
				item: "carrot@1 2 medium carrot",
			},
		]);
	});

	test("reports ingredients that differ only in order", () => {
		const next = { ...soup, ingredients: [rice, carrot(1)] };

		expect(diffRecipe(soup, next)).toEqual([
			{ kind: "reordered", field: "ingredients" },
		]);
	});
});
