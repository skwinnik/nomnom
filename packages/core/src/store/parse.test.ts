import { describe, expect, test } from "bun:test";
import { NomnomError, type Problem } from "../errors";
import { parseFoodFile, parseRecipeFile } from "./parse";

const file = "/data/foods/apple.yaml";

const appleV1 = [
	"---",
	"version: 1",
	"created: 2026-09-01T08:00:00+03:00",
	"name: Apple",
	"base_unit: g",
	"per: 100",
	"nutrients:",
	"  kcal: 52",
	"  protein: 0.3",
	"units:",
	"  small sized apple: 134",
	'  "123": 5',
	"",
].join("\n");

const appleV2 = [
	"---",
	"version: 2",
	"created: 2026-09-20T08:00:00+03:00",
	"name: Apple",
	'barcodes: ["0123456789012"]',
	"base_unit: g",
	"per: 100",
	"nutrients: { kcal: 50, retired_nutrient: 1 }",
	"archived: true",
	"",
].join("\n");

function problemsOf(parse: () => unknown): Problem[] {
	try {
		parse();
	} catch (error) {
		expect(error).toBeInstanceOf(NomnomError);
		return [...(error as NomnomError).problems];
	}
	throw new Error("expected the file to be rejected");
}

describe("parseFoodFile", () => {
	test("reads every version as its own snapshot", () => {
		const [v1, v2] = parseFoodFile(appleV1 + appleV2, file);

		expect(v1).toEqual({
			version: 1,
			created: "2026-09-01T08:00:00+03:00",
			name: "Apple",
			barcodes: [],
			baseUnit: "g",
			per: 100,
			nutrients: new Map([
				["kcal", 52],
				["protein", 0.3],
			]),
			units: new Map([
				["small sized apple", 134],
				["123", 5],
			]),
			archived: false,
		});
		expect(v2?.barcodes).toEqual(["0123456789012"]);
		expect(v2?.nutrients).toEqual(
			new Map([
				["kcal", 50],
				["retired_nutrient", 1],
			]),
		);
		expect(v2?.units.size).toBe(0);
		expect(v2?.archived).toBe(true);
	});

	test("keeps the order of units as written", () => {
		const [v1] = parseFoodFile(appleV1, file);

		expect([...(v1?.units.keys() ?? [])]).toEqual(["small sized apple", "123"]);
	});

	test("normalises unit names written by hand", () => {
		const [food] = parseFoodFile(
			appleV1.replace("small sized apple", "small   sized apple "),
			file,
		);

		expect([...(food?.units.keys() ?? [])]).toContain("small sized apple");
	});

	test("rejects a version out of sequence with the file and document number", () => {
		const problems = problemsOf(() =>
			parseFoodFile(
				appleV1 + appleV2.replace("version: 2", "version: 3"),
				file,
			),
		);

		expect(problems).toEqual([
			{
				file,
				line: 13,
				message: "document 2: expected version 2, found 3",
			},
		]);
	});

	test.each([
		[
			"a barcode that is not quoted",
			"barcodes: [0123]",
			"barcode 123 must be quoted text",
		],
		["a barcode with letters", 'barcodes: ["12a"]', "must contain digits only"],
		["a duplicate barcode", 'barcodes: ["1", "1"]', "listed more than once"],
		[
			"a negative nutrient",
			"nutrients: { kcal: -1 }",
			"'nutrients: kcal' must be non-negative",
		],
		["a zero per", "per: 0", "'per' must be positive"],
		["a missing name", "name: ''", "'name' must be non-empty text"],
		["an unknown field", "colour: red", "unknown field 'colour'"],
		[
			"a timestamp without an offset",
			"created: 2026-09-01T08:00:00",
			"'created' must be",
		],
		[
			"a unit named like the base unit",
			"units: { g: 1 }",
			"unit 'g' is already the base unit",
		],
		["a unit with a hash", "units: { 'can #2': 400 }", "can't contain '#'"],
		[
			"a unit defined twice after normalising",
			"units: { 'a  b': 1, 'a b': 2 }",
			"defined more than once",
		],
		[
			"an archived flag that is not a boolean",
			"archived: yes",
			"'archived' must be true or false",
		],
	])("rejects %s", (_name, line, message) => {
		const base = [
			"---",
			"version: 1",
			"created: 2026-09-01T08:00:00+03:00",
			"name: Apple",
			"base_unit: g",
			"per: 100",
			"nutrients: { kcal: 52 }",
		];
		const key = line.slice(0, line.indexOf(":"));
		const lines = base.filter((l) => !l.startsWith(`${key}:`));
		const problems = problemsOf(() =>
			parseFoodFile([...lines, line, ""].join("\n"), file),
		);

		expect(problems).toHaveLength(1);
		expect(problems[0]?.message).toStartWith("document 1: ");
		expect(problems[0]?.message).toContain(message);
		expect(problems[0]?.file).toBe(file);
	});

	test("rejects malformed YAML with its line", () => {
		const problems = problemsOf(() =>
			parseFoodFile(`${appleV1}---\nversion: 2\nname: [\n`, file),
		);

		expect(problems[0]?.message).toStartWith("document 2: invalid YAML");
		expect(problems[0]?.line).toBeGreaterThan(13);
	});

	test("rejects a file without documents", () => {
		expect(problemsOf(() => parseFoodFile("", file))[0]?.message).toBe(
			"the file has no versions",
		);
	});
});

describe("parseRecipeFile", () => {
	const recipeFile = "/data/recipes/chicken-soup.yaml";
	const soup = [
		"---",
		"version: 1",
		"created: 2026-09-29T20:10:00+03:00",
		"name: Chicken Soup",
		"servings: 4",
		"base_unit: g",
		"yield: 1000",
		"units:",
		"  bowl: 350",
		"ingredients:",
		"  - food: chicken-breast",
		"    version: 2",
		"    amount: 300",
		"    unit: g",
		"  - recipe: chicken-stock",
		"    version: 1",
		"    amount: 0.5",
		"    unit: serving",
		"",
	].join("\n");

	test("reads a recipe with a yield and nested ingredients", () => {
		const [recipe] = parseRecipeFile(soup, recipeFile);

		expect(recipe).toEqual({
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
					kind: "recipe",
					slug: "chicken-stock",
					version: 1,
					amount: 0.5,
					unit: "serving",
				},
			],
			archived: false,
		});
	});

	test("reads a recipe without a yield", () => {
		const text = soup.replace(
			"base_unit: g\nyield: 1000\nunits:\n  bowl: 350\n",
			"",
		);

		const [recipe] = parseRecipeFile(text, recipeFile);

		expect(recipe?.yield).toBeUndefined();
		expect(recipe?.units.size).toBe(0);
	});

	test.each([
		[
			"a yield without a base unit",
			["base_unit: g\n", ""],
			"'base_unit' and 'yield' must be given together",
		],
		[
			"units without a yield",
			["base_unit: g\nyield: 1000\n", ""],
			"'units' need a 'yield'",
		],
		[
			"a unit named serving",
			["bowl: 350", "serving: 350"],
			"'serving' is reserved",
		],
		[
			"a base unit named serving",
			["base_unit: g", "base_unit: serving"],
			"'serving' is reserved",
		],
		[
			"an ingredient with both kinds",
			[
				"  - food: chicken-breast\n",
				"  - food: chicken-breast\n    recipe: x\n",
			],
			"exactly one of 'food' and 'recipe'",
		],
		[
			"an ingredient without a unit",
			["    unit: g\n", ""],
			"'unit in ingredient 1' must be text",
		],
		[
			"an ingredient with a zero amount",
			["amount: 300", "amount: 0"],
			"'amount in ingredient 1' must be positive",
		],
		[
			"an ingredient without a version",
			["    version: 2\n", ""],
			"'version' must be a positive whole number in ingredient 1",
		],
		[
			"an ingredient with a bad name",
			["food: chicken-breast", "food: ../etc"],
			"is not a valid food name",
		],
		[
			"no ingredients",
			[/ingredients:[\s\S]*/, "ingredients: []\n"],
			"'ingredients' must be a non-empty list",
		],
	] as const)("rejects %s", (_name, [from, to], message) => {
		const problems = problemsOf(() =>
			parseRecipeFile(soup.replace(from, to), recipeFile),
		);

		expect(problems.map((p) => p.message).join("\n")).toContain(message);
	});
});
