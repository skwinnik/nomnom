import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config/__mocks__/config-service";
import { food } from "../store/__mocks__/versioned-store";
import { usabilityProblems } from "./usable";

const { nutrients } = defaultConfig;

describe("usabilityProblems", () => {
	test("is empty for a usable version", () => {
		expect(
			usabilityProblems(
				food({ nutrients: { kcal: 52, protein: 0.3 } }),
				nutrients,
			),
		).toEqual([]);
	});

	test("reports a missing required nutrient", () => {
		expect(
			usabilityProblems(food({ nutrients: { protein: 0.3 } }), nutrients),
		).toEqual(["the required nutrient 'kcal' is missing"]);
	});

	test("reports an id that is not in the catalog", () => {
		expect(
			usabilityProblems(
				food({ nutrients: { kcal: 360, protien: 7 } }),
				nutrients,
			),
		).toEqual(["'protien' is not a nutrient in config.yaml"]);
	});

	test("reports both at once", () => {
		expect(
			usabilityProblems(food({ nutrients: { protien: 7 } }), nutrients),
		).toEqual([
			"'protien' is not a nutrient in config.yaml",
			"the required nutrient 'kcal' is missing",
		]);
	});

	test("accepts an absent nutrient that is not required", () => {
		expect(
			usabilityProblems(food({ nutrients: { kcal: 0 } }), nutrients),
		).toEqual([]);
	});
});
