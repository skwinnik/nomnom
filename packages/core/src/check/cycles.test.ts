import { describe, expect, test } from "bun:test";
import { recipe } from "../store/__mocks__/versioned-store";
import type { Ingredient, RecipeVersion } from "../store/records";
import { findCycles } from "./cycles";

/** A recipe version containing the given `<slug>@<version>` recipes. */
function containing(version: number, ...refs: string[]): RecipeVersion {
	return recipe({
		version,
		ingredients: refs.map((ref): Ingredient => {
			const [slug = "", pinned = "1"] = ref.split("@");
			return {
				kind: "recipe",
				slug,
				version: Number(pinned),
				amount: 1,
				unit: "serving",
			};
		}),
	});
}

function cycles(recipes: Record<string, RecipeVersion[]>) {
	return findCycles(new Map(Object.entries(recipes)));
}

describe("findCycles", () => {
	test("finds none without a cycle", () => {
		expect(
			cycles({
				soup: [containing(1, "stock@1"), containing(2, "stock@1", "stock@2")],
				stock: [containing(1), containing(2)],
			}),
		).toEqual([]);
	});

	test("finds two recipes that reference each other", () => {
		expect(
			cycles({ a: [containing(1, "b@1")], b: [containing(1, "a@1")] }),
		).toEqual([["a@1", "b@1"]]);
	});

	test("reports cycles that share recipes as one group", () => {
		expect(
			cycles({
				c: [containing(1, "b@1")],
				b: [containing(1, "a@1")],
				a: [containing(1, "b@1", "c@1")],
			}),
		).toEqual([["a@1", "b@1", "c@1"]]);
	});

	test("finds a version that pins itself", () => {
		expect(cycles({ a: [containing(1, "a@1")] })).toEqual([["a@1"]]);
	});

	test("a version that pins another version of its recipe is no cycle", () => {
		expect(cycles({ a: [containing(1), containing(2, "a@1")] })).toEqual([]);
	});

	test("leaves out a recipe that only contains a cycle", () => {
		expect(
			cycles({
				soup: [containing(1, "a@1")],
				a: [containing(1, "b@1")],
				b: [containing(1, "a@1")],
			}),
		).toEqual([["a@1", "b@1"]]);
	});

	test("reports separate cycles in the order of their first version", () => {
		expect(
			cycles({
				z: [containing(1, "y@1")],
				y: [containing(1, "z@1")],
				b: [containing(1, "b@1")],
			}),
		).toEqual([["b@1"], ["y@1", "z@1"]]);
	});

	test("ignores ingredients that pin versions that don't exist, and foods", () => {
		const food: Ingredient = {
			kind: "food",
			slug: "a",
			version: 1,
			amount: 1,
			unit: "g",
		};
		const pins = containing(1, "a@2", "unicorn@1");
		expect(
			cycles({ a: [{ ...pins, ingredients: [...pins.ingredients, food] }] }),
		).toEqual([]);
	});
});
