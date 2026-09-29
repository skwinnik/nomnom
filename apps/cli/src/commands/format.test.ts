import { describe, expect, test } from "bun:test";
import {
	formatColumns,
	formatItems,
	formatNutrients,
	formatStoredNutrients,
} from "./format";

describe("formatItems", () => {
	test("aligns the slug@version and kind columns, the name last and in full", () => {
		expect(
			formatItems([
				{
					kind: "food",
					slug: "greek-yogurt-2-4601234567890",
					version: 1,
					name: "Greek Yogurt 2%",
				},
				{
					kind: "recipe",
					slug: "yogurt-bowl",
					version: 2,
					name: "Yogurt Bowl",
				},
			]),
		).toBe(
			[
				"greek-yogurt-2-4601234567890@1  food    Greek Yogurt 2%",
				"yogurt-bowl@2                   recipe  Yogurt Bowl",
				"",
			].join("\n"),
		);
	});

	test("pads only to the widest value in the output", () => {
		expect(
			formatItems([{ kind: "food", slug: "apple", version: 2, name: "Apple" }]),
		).toBe("apple@2  food  Apple\n");
	});
});

describe("formatColumns", () => {
	test("indents lines and leaves no trailing spaces", () => {
		expect(
			formatColumns(
				[
					["g", "base unit"],
					["medium sized apple", "180 g"],
					["serving", ""],
				],
				"  ",
			),
		).toBe(
			[
				"  g                   base unit",
				"  medium sized apple  180 g",
				"  serving",
				"",
			].join("\n"),
		);
	});
});

describe("formatStoredNutrients", () => {
	test("prints values as stored, and - when absent", () => {
		const nutrient = (name: string, unit: string, value?: number) => ({
			id: name.toLowerCase(),
			name,
			unit,
			value,
		});

		expect(
			formatStoredNutrients("Per 100 g", [
				nutrient("Energy", "kcal", 52),
				nutrient("Protein", "g", 0.3),
				nutrient("Fat", "g"),
				nutrient("Carbohydrates", "g", 14),
				nutrient("Fiber", "g", 2.4),
			]),
		).toBe(
			[
				"Per 100 g:",
				"  Energy          52 kcal",
				"  Protein        0.3 g",
				"  Fat              - g",
				"  Carbohydrates   14 g",
				"  Fiber          2.4 g",
				"",
			].join("\n"),
		);
	});
});

describe("formatNutrients", () => {
	test("rounds to one decimal place", () => {
		expect(
			formatNutrients("Per serving", [
				{ id: "kcal", name: "Energy", unit: "kcal", value: 136.255 },
				{ id: "fat", name: "Fat", unit: "g", value: 0 },
			]),
		).toBe("Per serving:\n  Energy  136.3 kcal\n  Fat       0.0 g\n");
	});
});
