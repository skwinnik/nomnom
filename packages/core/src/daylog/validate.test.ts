import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { defaultConfig } from "../config/__mocks__/config-service";
import { NomnomError } from "../errors";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import { parseDay } from "./parse";
import { validateDay } from "./validate";

const file = "/data/logs/2026/2026-09-29.nom";

function check(...lines: string[]) {
	const store = createFakeStore({
		foods: {
			apple: [
				food({ units: { "small sized apple": 134 } }),
				food({ version: 2, units: { "medium sized apple": 180 } }),
			],
			pear: [food(), food({ version: 2, archived: true })],
		},
		recipes: {
			batter: [
				recipe({
					ingredients: [
						{ kind: "food", slug: "apple", version: 1, amount: 1, unit: "g" },
					],
				}),
			],
		},
	});
	return validateDay(parseDay(lines.join("\n")), {
		config: defaultConfig,
		catalog: createCatalog({ store }),
		file,
	});
}

describe("validateDay", () => {
	test("accepts a valid day", async () => {
		const result = await check(
			"# a comment",
			"[breakfast]",
			"apple@2 1 medium sized apple",
			"apple@1 150",
			"batter@1 0.5 serving",
			"pear@1 100 g   # pinned before it was archived",
			"",
			"[dinner]",
			'"restaurant ramen" kcal=800 protein=35',
		);

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		expect([...result.meals.keys()]).toEqual(["breakfast", "dinner"]);
	});

	test("rejects an entry before any section", async () => {
		const result = await check("apple@2 1", "[lunch]");

		expect(result.errors).toEqual([
			{
				file,
				line: 1,
				message: expect.stringContaining("before any section header"),
			},
		]);
	});

	test("merges duplicate sections", async () => {
		const result = await check(
			"[lunch]",
			"apple@1 1",
			"[dinner]",
			"apple@1 2",
			"[lunch]",
			"apple@1 3",
		);

		expect(result.meals.get("lunch")?.map((line) => line.number)).toEqual([
			2, 6,
		]);
	});

	test("keeps an unknown meal with a warning naming it", async () => {
		const result = await check("[brunch]", "apple@1 1");

		expect(result.errors).toEqual([]);
		expect(result.meals.get("brunch")).toHaveLength(1);
		expect(result.warnings).toEqual([
			{
				file,
				line: 1,
				message: expect.stringContaining("'brunch' is not a meal"),
			},
		]);
	});

	test.each([
		[
			"an unknown slug",
			"unicorn@1 1",
			"'unicorn' is neither a food nor a recipe",
		],
		["a version that does not exist", "apple@3 1", "'apple@3' does not exist"],
		[
			"a unit the version does not allow",
			"apple@2 1 cup",
			"'cup' is not a unit of apple@2",
		],
		[
			"a unit of another version",
			"apple@2 1 small sized apple",
			"'small sized apple' is not a unit of apple@2",
		],
		["serving on a food", "apple@2 1 serving", "'serving' is not a unit"],
		[
			"a key that is not a nutrient",
			'"ramen" kcal=800 weight=300',
			"'weight' is not a nutrient",
		],
		[
			"a nutrient given twice",
			'"ramen" kcal=800 kcal=900',
			"'kcal' is given more than once",
		],
		[
			"a missing required nutrient",
			'"ramen" protein=35',
			"required nutrient 'kcal' is missing",
		],
		[
			"an amount and unit instead of nutrients",
			'"ramen" 300 g',
			"expected <nutrient>=<number>",
		],
		["a syntax error", "apple 1 medium sized apple", "needs a version"],
	])("rejects %s with its line number", async (_name, line, message) => {
		const result = await check("[lunch]", line);

		expect(result.errors).toEqual([
			{ file, line: 2, message: expect.stringContaining(message) },
		]);
	});

	test("reports every error with its line number", async () => {
		const result = await check(
			"[breakfast]",
			"apple@2 1",
			"apple 1",
			"apple@2 1",
			"",
			"[lunch]",
			'"x" weight=1',
			"apple@2 1",
		);

		expect(result.errors.map((problem) => problem.line)).toEqual([3, 7, 7]);
	});

	test("reports a broken food file with its own location", async () => {
		const store = createFakeStore();
		const catalog = createCatalog({ store });
		const broken = {
			...catalog,
			resolve: async () => {
				throw new NomnomError("/data/foods/apple.yaml is invalid", [
					{
						file: "/data/foods/apple.yaml",
						line: 4,
						message: "document 1: 'per' must be a number",
					},
				]);
			},
		};

		const result = await validateDay(parseDay("[lunch]\napple@1 1\n"), {
			config: defaultConfig,
			catalog: broken,
			file,
		});

		expect(result.errors).toEqual([
			{ file, line: 2, message: "/data/foods/apple.yaml is invalid" },
			{
				file: "/data/foods/apple.yaml",
				line: 4,
				message: "document 1: 'per' must be a number",
			},
		]);
	});
});
