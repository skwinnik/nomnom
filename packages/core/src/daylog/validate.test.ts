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
			"greek-yogurt-2-460123": [food()],
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

	describe("times", () => {
		test("accepts the example day with times", async () => {
			const result = await check(
				"[breakfast]",
				"07:45 greek-yogurt-2-460123@1  150 g",
				"apple@2                        1 medium sized apple",
				"",
				"[dinner]",
				'19:30 "restaurant ramen"       kcal=800 protein=35  # with friends',
			);

			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(
				[...result.meals.values()].map((lines) =>
					lines.map((line) => line.number),
				),
			).toEqual([[2, 3], [6]]);
		});

		test("accepts DST wall times and a time that doesn't match its meal", async () => {
			const result = await check(
				"[breakfast]",
				'23:30 "late cereal" kcal=300',
				"09:00 apple@2 1 medium sized apple",
				"07:30 apple@1 150",
				"[snack]",
				'00:00 "midnight snack" kcal=150',
				'02:30 "bottle of milk" kcal=120',
				'02:15 "tea" kcal=2',
				'02:45 "biscuit" kcal=60',
				'23:59 "tea" kcal=2',
			);

			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
		});

		test("reports each malformed time once, with the file and line number", async () => {
			const result = await check(
				"[breakfast]",
				"8:15 apple@2 1 medium sized apple",
				"24:00 apple@2 1 medium sized apple",
				"12:60 apple@2 1 medium sized apple",
				"08:15:30 apple@2 1 medium sized apple",
				"08:15apple@2 1 medium sized apple",
				'12:30"ramen" kcal=800',
			);

			expect(result.errors).toEqual([
				{
					file,
					line: 2,
					message:
						"'8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
				},
				{
					file,
					line: 3,
					message:
						"'24:00' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
				},
				{
					file,
					line: 4,
					message:
						"'12:60' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
				},
				{
					file,
					line: 5,
					message:
						"'08:15:30' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
				},
				{
					file,
					line: 6,
					message: "the time '08:15' must be followed by a space and an entry",
				},
				{
					file,
					line: 7,
					message: "the time '12:30' must be followed by a space and an entry",
				},
			]);
		});

		test("reports each time without an entry once, with the file and line number", async () => {
			const result = await check(
				"[snack]",
				"08:15",
				"08:15  # coffee",
				"08:15 [lunch]",
				"08:15 09:00 apple@2 1",
			);

			expect(result.errors).toEqual([
				{ file, line: 2, message: "the time '08:15' needs an entry after it" },
				{ file, line: 3, message: "the time '08:15' needs an entry after it" },
				{
					file,
					line: 4,
					message:
						"the time '08:15' needs an entry after it, not a section header",
				},
				{
					file,
					line: 5,
					message: "a line has at most one time, got '09:00' after '08:15'",
				},
			]);
			expect([...result.meals.keys()]).toEqual(["snack"]);
		});

		test("checks the entry after a time like any other entry", async () => {
			const result = await check(
				"[lunch]",
				"08:15 apple 1 medium sized apple",
				"12:00 apple@2 1 cup",
			);

			expect(result.errors).toEqual([
				{
					file,
					line: 2,
					message:
						"'apple' needs a version: write it as apple@<version>, as in apple@2",
				},
				{ file, line: 3, message: expect.stringContaining("'cup'") },
			]);
		});

		test("an untimed day gives the same problems and warnings as without times", async () => {
			const result = await check(
				"[brunch]",
				"7up@1 1 can",
				"apple@2 1 medium sized apple",
				'"lunch at 12:30" kcal=500',
				"apple 1",
				"apple@2 1 cup",
			);

			expect(result.errors).toEqual([
				{
					file,
					line: 2,
					message: expect.stringContaining(
						"'7up' is neither a food nor a recipe",
					),
				},
				{
					file,
					line: 5,
					message:
						"'apple' needs a version: write it as apple@<version>, as in apple@2",
				},
				{
					file,
					line: 6,
					message: expect.stringContaining("'cup' is not a unit of apple@2"),
				},
			]);
			expect(result.warnings).toEqual([
				{
					file,
					line: 1,
					message:
						"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
				},
			]);
			expect(result.meals.get("brunch")?.map((line) => line.number)).toEqual([
				2, 3, 4, 6,
			]);
		});
	});

	describe("an unusable food version", () => {
		const validate = (omitTargetProblems?: boolean) =>
			validateDay(parseDay("[lunch]\napple@1 150 g\napple@2 1 cup\n"), {
				config: defaultConfig,
				catalog: createCatalog({
					store: createFakeStore({
						foods: {
							apple: [
								food({ nutrients: { protein: 0.3 } }),
								food({ version: 2 }),
							],
						},
					}),
				}),
				file,
				omitTargetProblems,
			});

		test("is reported at the line, naming the version and the nutrient", async () => {
			const result = await validate();

			expect(result.errors).toEqual([
				{
					file,
					line: 2,
					message:
						"'apple@1' is unusable: the required nutrient 'kcal' is missing",
				},
				{ file, line: 3, message: expect.stringContaining("'cup'") },
			]);
		});

		test("is left out with omitTargetProblems, unlike problems of the reference", async () => {
			const result = await validate(true);

			expect(result.errors).toEqual([
				{ file, line: 3, message: expect.stringContaining("'cup'") },
			]);
		});
	});

	test("reports a broken food file with its own location", async () => {
		const store = createFakeStore();
		const catalog = createCatalog({ store });
		const broken = {
			...catalog,
			find: async () => {
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
