import { describe, expect, test } from "bun:test";
import { food, recipe } from "../store/__mocks__/versioned-store";
import { measureOf, unitTable } from "./units";

describe("unitTable", () => {
	test("a food allows its base unit and its additional units", () => {
		const table = unitTable({
			kind: "food",
			slug: "apple",
			record: food({ units: { "100g": 100, "small sized apple": 134 } }),
		});

		expect([...table]).toEqual([
			["g", 1],
			["100g", 100],
			["small sized apple", 134],
		]);
	});

	test("a recipe with a yield allows its base unit, serving and its units", () => {
		const table = unitTable({
			kind: "recipe",
			slug: "soup",
			record: recipe({
				servings: 4,
				yield: { baseUnit: "g", amount: 1000 },
				units: { bowl: 350 },
			}),
		});

		expect([...table]).toEqual([
			["g", 1],
			["serving", 250],
			["bowl", 350],
		]);
	});

	test("a recipe without a yield allows only serving", () => {
		const table = unitTable({
			kind: "recipe",
			slug: "batter",
			record: recipe({ servings: 2 }),
		});

		expect([...table]).toEqual([["serving", 1]]);
	});
});

describe("measureOf", () => {
	test("the default unit is the base unit, or serving without a yield", () => {
		expect(
			measureOf({ kind: "food", slug: "a", record: food({ baseUnit: "ml" }) }),
		).toMatchObject({
			defaultUnit: "ml",
			whole: 100,
		});
		expect(
			measureOf({
				kind: "recipe",
				slug: "b",
				record: recipe({ servings: 4, yield: { baseUnit: "g", amount: 1000 } }),
			}),
		).toMatchObject({ defaultUnit: "g", whole: 1000 });
		expect(
			measureOf({ kind: "recipe", slug: "c", record: recipe({ servings: 2 }) }),
		).toMatchObject({ defaultUnit: "serving", whole: 2 });
	});
});
