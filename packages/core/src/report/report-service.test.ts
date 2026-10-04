import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import type { Nutrients } from "../nutrition/nutrition";
import { createNutrition } from "../nutrition/nutrition";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import {
	createReportService,
	type Report,
	type ReportInput,
} from "./report-service";

const dayPath = (date: string) => `/data/logs/${date.slice(0, 4)}/${date}.nom`;

const store = () =>
	createFakeStore({
		foods: {
			"chicken-breast": [food({ nutrients: { kcal: 165, protein: 31 } })],
			carrot: [
				food({
					name: "Carrot",
					nutrients: { kcal: 41, fiber: 2.8 },
					units: { "medium carrot": 61 },
				}),
			],
			water: [food({ baseUnit: "ml", nutrients: { kcal: 0 } })],
			rice: [food({ name: "Rice", nutrients: { kcal: 130, carbs: 28 } })],
			apple: [food({ name: "Apple", nutrients: { protein: 0.3 } })],
			coffee: [
				food({ name: "Coffee", nutrients: { kcal: 1 }, units: { cup: 240 } }),
			],
			oats: [
				food({ name: "Oats", nutrients: { kcal: 380 } }),
				food({
					version: 2,
					name: "Oats",
					nutrients: { kcal: 370, protein: 13, carbs: 60 },
				}),
			],
			milk: [
				food({
					name: "Milk",
					baseUnit: "ml",
					nutrients: { kcal: 60, protein: 3.2, fat: 3.3 },
				}),
			],
		},
		recipes: {
			"chicken-soup": [
				recipe({
					name: "Chicken Soup",
					servings: 4,
					yield: { baseUnit: "g", amount: 1000 },
					ingredients: [
						{
							kind: "food",
							slug: "chicken-breast",
							version: 1,
							amount: 300,
							unit: "g",
						},
						{
							kind: "food",
							slug: "carrot",
							version: 1,
							amount: 2,
							unit: "medium carrot",
						},
						{
							kind: "food",
							slug: "water",
							version: 1,
							amount: 700,
							unit: "ml",
						},
					],
				}),
			],
			"chicken-stock": [
				recipe({
					name: "Chicken Stock",
					yield: { baseUnit: "g", amount: 2000 },
					ingredients: [
						{
							kind: "food",
							slug: "chicken-breast",
							version: 1,
							amount: 1000,
							unit: "g",
						},
					],
				}),
			],
			soup: [
				recipe({
					name: "Soup",
					yield: { baseUnit: "g", amount: 1000 },
					ingredients: [
						{
							kind: "recipe",
							slug: "chicken-stock",
							version: 1,
							amount: 500,
							unit: "g",
						},
						{ kind: "food", slug: "rice", version: 1, amount: 100, unit: "g" },
					],
				}),
			],
			a: [
				recipe({
					ingredients: [
						{
							kind: "recipe",
							slug: "b",
							version: 1,
							amount: 1,
							unit: "serving",
						},
					],
				}),
			],
			b: [
				recipe({
					ingredients: [
						{
							kind: "recipe",
							slug: "a",
							version: 1,
							amount: 1,
							unit: "serving",
						},
					],
				}),
			],
		},
	});

/** Day files by date. Today is 2026-09-29. */
function setup(days: Record<string, string> = {}) {
	const files: Record<string, string> = {};
	for (const [date, text] of Object.entries(days)) files[dayPath(date)] = text;
	const config = createStaticConfigService();
	const catalog = createCatalog({ store: store() });
	const service = createReportService({
		fs: createMemoryFileSystem(files),
		// Local noon on 2026-09-29, whatever the time zone.
		clock: createFixedClock(new Date(2026, 8, 29, 12, 0)),
		paths: dataPaths("/data"),
		config,
		catalog,
		nutrition: createNutrition({ catalog, config }),
	});
	return (input: ReportInput = {}) => service.report(input);
}

const values = (nutrients: Nutrients | undefined) =>
	nutrients && Object.fromEntries(nutrients);

async function rejection(promise: Promise<unknown>): Promise<NomnomError> {
	const error: unknown = await promise.catch((e) => e);
	expect(error).toBeInstanceOf(NomnomError);
	return error as NomnomError;
}

describe("dates", () => {
	test("reports today when no date is given", async () => {
		const report = await setup()();

		expect(report).toMatchObject({
			kind: "day",
			from: "2026-09-29",
			to: "2026-09-29",
			today: "2026-09-29",
		});
		expect(report.days.map((day) => day.date)).toEqual(["2026-09-29"]);
	});

	test("one date gives a day report", async () => {
		const report = await setup()({ from: "2026-09-20" });

		expect(report).toMatchObject({
			kind: "day",
			from: "2026-09-20",
			to: "2026-09-20",
		});
	});

	test("two equal dates give a range report", async () => {
		const report = await setup()({ from: "2026-09-20", to: "2026-09-20" });

		expect(report.kind).toBe("range");
		expect(report.days).toHaveLength(1);
	});

	test("two dates cover the range inclusively", async () => {
		const report = await setup()({ from: "2026-09-23", to: "2026-09-29" });

		expect(report.days.map((day) => day.date)).toEqual([
			"2026-09-23",
			"2026-09-24",
			"2026-09-25",
			"2026-09-26",
			"2026-09-27",
			"2026-09-28",
			"2026-09-29",
		]);
	});

	test.each([
		[{ from: "2026-02-30" }, "2026-02-30"],
		[{ from: "2026-09-01", to: "yesterday" }, "yesterday"],
	])("rejects an invalid date: %j", async (input, name) => {
		const error = await rejection(setup()(input));

		expect(error.message).toBe(
			`The date must be a real date as yyyy-mm-dd, got '${name}'`,
		);
	});

	test("rejects an end date before the start date", async () => {
		const error = await rejection(
			setup()({ from: "2026-09-29", to: "2026-09-23" }),
		);

		expect(error.message).toBe(
			"The end date 2026-09-23 is before the start date 2026-09-29",
		);
	});
});

describe("entry nutrients", () => {
	test("reference and inline entries", async () => {
		const report = await setup({
			"2026-09-29": [
				"[lunch]",
				"chicken-soup@1 1 serving",
				"[dinner]",
				'"restaurant ramen" kcal=800 protein=35',
			].join("\n"),
		})();

		const [day] = report.days;
		expect(day?.logged).toBe(true);
		const [lunch, dinner] = day?.meals ?? [];
		expect(lunch?.entries).toEqual([
			{
				line: 2,
				time: undefined,
				kind: "reference",
				slug: "chicken-soup",
				version: 1,
				item: "recipe",
				name: "Chicken Soup",
				amount: 1,
				unit: "serving",
				nutrients: expect.any(Map),
			},
		]);
		expect(lunch?.totals.get("kcal")).toBeCloseTo(136.255, 10);
		expect(dinner?.entries).toEqual([
			{
				line: 4,
				time: undefined,
				kind: "inline",
				description: "restaurant ramen",
				nutrients: new Map([
					["kcal", 800],
					["protein", 35],
					["fat", 0],
					["carbs", 0],
					["fiber", 0],
				]),
			},
		]);
		expect(values(dinner?.totals)).toEqual({
			kcal: 800,
			protein: 35,
			fat: 0,
			carbs: 0,
			fiber: 0,
		});
		expect(day?.totals.get("kcal")).toBeCloseTo(936.255, 10);
		expect(report.totals.get("kcal")).toBeCloseTo(936.255, 10);
	});

	test("a nested recipe contributes its fraction", async () => {
		const report = await setup({ "2026-09-29": "[lunch]\nsoup@1 500 g\n" })();

		// soup@1: 500 of 2000 g stock (1650 kcal, 310 g protein) plus 100 g rice.
		const nutrients = report.days[0]?.meals[0]?.entries?.[0]?.nutrients;
		expect(nutrients?.get("kcal")).toBeCloseTo((1650 / 4 + 130) / 2, 10);
		expect(nutrients?.get("protein")).toBeCloseTo(310 / 4 / 2, 10);
		expect(nutrients?.get("carbs")).toBeCloseTo(28 / 2, 10);
	});

	test("a reference without a unit uses the default unit", async () => {
		const report = await setup({ "2026-09-29": "[lunch]\nrice@1 80\n" })();

		const entry = report.days[0]?.meals[0]?.entries?.[0];
		expect(entry).toMatchObject({ amount: 80, unit: "g", name: "Rice" });
		expect(entry?.nutrients.get("kcal")).toBeCloseTo(104, 10);
	});
});

describe("meal order", () => {
	const mealsOf = async (text: string) =>
		(await setup({ "2026-09-29": text })()).days[0]?.meals.map((meal) => ({
			meal: meal.meal,
			configured: meal.configured,
			lines: meal.entries?.map((entry) => entry.line),
		}));

	test("sections out of order follow the configured order", async () => {
		expect(await mealsOf("[dinner]\nrice@1 80\n[lunch]\nrice@1 90\n")).toEqual([
			{ meal: "lunch", configured: true, lines: [4] },
			{ meal: "dinner", configured: true, lines: [2] },
		]);
	});

	test("duplicate sections are merged in file order", async () => {
		expect(
			await mealsOf(
				"[lunch]\nrice@1 80\n[dinner]\nrice@1 1\n[lunch]\nrice@1 90\n",
			),
		).toEqual([
			{ meal: "lunch", configured: true, lines: [2, 6] },
			{ meal: "dinner", configured: true, lines: [4] },
		]);
	});

	test("an empty section is left out", async () => {
		expect(await mealsOf("[breakfast]\n\n[lunch]\nrice@1 80\n")).toEqual([
			{ meal: "lunch", configured: true, lines: [4] },
		]);
	});

	test("unknown meals follow the configured ones in first-seen order", async () => {
		expect(
			await mealsOf(
				"[late-night]\nrice@1 1\n[brunch]\nrice@1 2\n[snack]\nrice@1 3\n",
			),
		).toEqual([
			{ meal: "snack", configured: true, lines: [6] },
			{ meal: "late-night", configured: false, lines: [2] },
			{ meal: "brunch", configured: false, lines: [4] },
		]);
	});
});

describe("ranges", () => {
	const kcal = (value: number) => `"x" kcal=${value}`;

	test("days not logged, totals and the average per logged day", async () => {
		const report = await setup({
			"2026-09-20": `[lunch]\n${kcal(2000)}\n`,
			"2026-09-21": "# nothing yet\n[lunch]\n",
			"2026-09-22": `[lunch]\n${kcal(1800)}\n`,
		})({ from: "2026-09-20", to: "2026-09-22" });

		expect(report.days.map((day) => [day.date, day.logged])).toEqual([
			["2026-09-20", true],
			["2026-09-21", false],
			["2026-09-22", true],
		]);
		expect(report.days[1]).toEqual({
			date: "2026-09-21",
			path: dayPath("2026-09-21"),
			logged: false,
			meals: [],
			totals: new Map([
				["kcal", 0],
				["protein", 0],
				["fat", 0],
				["carbs", 0],
				["fiber", 0],
			]),
		});
		expect(report.loggedDays).toBe(2);
		expect(report.totals.get("kcal")).toBe(3800);
		expect(report.averageDays).toEqual(["2026-09-20", "2026-09-22"]);
		expect(report.average?.get("kcal")).toBe(1900);
		expect(report.average?.get("protein")).toBe(0);
	});

	test("today counts in the total and is left out of the average", async () => {
		const report = await setup({
			"2026-09-23": `[lunch]\n${kcal(1000)}\n`,
			"2026-09-25": `[lunch]\n${kcal(2000)}\n`,
			"2026-09-26": `[lunch]\n${kcal(3000)}\n`,
			"2026-09-28": `[lunch]\n${kcal(2000)}\n`,
			"2026-09-29": `[lunch]\n${kcal(500)}\n`,
		})({ from: "2026-09-23", to: "2026-09-29" });

		expect(report.loggedDays).toBe(5);
		expect(report.totals.get("kcal")).toBe(8500);
		expect(report.averageDays).toEqual([
			"2026-09-23",
			"2026-09-25",
			"2026-09-26",
			"2026-09-28",
		]);
		expect(report.average?.get("kcal")).toBe(2000);
	});

	test("only today logged gives no average", async () => {
		const report = await setup({ "2026-09-29": `[lunch]\n${kcal(500)}\n` })({
			from: "2026-09-27",
			to: "2026-09-29",
		});

		expect(report.loggedDays).toBe(1);
		expect(report.totals.get("kcal")).toBe(500);
		expect(report.averageDays).toEqual([]);
		expect(report.average).toBeUndefined();
	});

	test("entries are left out of a range unless requested", async () => {
		const run = setup({ "2026-09-23": `[lunch]\n${kcal(1000)}\n` });
		const range = { from: "2026-09-23", to: "2026-09-24" };

		const without = await run(range);
		const withEntries = await run({ ...range, entries: true });

		expect(without.days[0]?.meals[0]).not.toHaveProperty("entries");
		expect(without.days[0]?.meals[0]?.totals.get("kcal")).toBe(1000);
		expect(withEntries.days[0]?.meals[0]?.entries).toHaveLength(1);
	});

	test("a day report always has entries", async () => {
		const report = await setup({ "2026-09-23": `[lunch]\n${kcal(1000)}\n` })({
			from: "2026-09-23",
			entries: false,
		});

		expect(report.days[0]?.meals[0]?.entries).toHaveLength(1);
	});
});

describe("entry times", () => {
	const untimed = [
		"[breakfast]",
		"coffee@1 1 cup",
		"oats@2 60 g",
		"milk@1 200 ml",
		"[dinner]",
		'"restaurant ramen" kcal=800 protein=35',
	].join("\n");
	const timed = [
		"[breakfast]",
		"09:00 coffee@1 1 cup",
		"oats@2 60 g",
		"07:30 milk@1 200 ml",
		"[dinner]",
		'19:30 "restaurant ramen" kcal=800 protein=35',
	].join("\n");

	const entriesOf = (report: Report) =>
		report.days.flatMap((day) =>
			day.meals.flatMap((meal) => meal.entries ?? []),
		);

	/** Every calculated value of a report, without its entries' times. */
	const valuesOf = (report: Report) => ({
		days: report.days.map((day) => ({
			totals: values(day.totals),
			meals: day.meals.map((meal) => ({
				meal: meal.meal,
				totals: values(meal.totals),
				entries: meal.entries?.map((entry) => ({
					line: entry.line,
					nutrients: values(entry.nutrients),
				})),
			})),
		})),
		loggedDays: report.loggedDays,
		totals: values(report.totals),
		averageDays: report.averageDays,
		average: values(report.average),
	});

	test("a timed reference and a timed inline entry have their times", async () => {
		const report = await setup({
			"2026-09-29": [
				"[breakfast]",
				"08:15 rice@1 80",
				"[dinner]",
				'19:30 "restaurant ramen" kcal=800 protein=35',
			].join("\n"),
		})();

		expect(entriesOf(report)).toEqual([
			expect.objectContaining({ line: 2, kind: "reference", time: "08:15" }),
			expect.objectContaining({ line: 4, kind: "inline", time: "19:30" }),
		]);
	});

	test("an untimed entry has the time key, undefined", async () => {
		const report = await setup({ "2026-09-29": untimed })();

		const entries = entriesOf(report);
		expect(entries).toHaveLength(4);
		for (const entry of entries) {
			expect(Object.hasOwn(entry, "time")).toBe(true);
			expect(entry.time).toBeUndefined();
		}
	});

	test("entries keep their file order, whatever their times", async () => {
		const report = await setup({ "2026-09-29": timed })();

		const breakfast = report.days[0]?.meals[0];
		expect(breakfast?.meal).toBe("breakfast");
		expect(
			breakfast?.entries?.map((entry) => [
				entry.kind === "reference" ? entry.slug : entry.description,
				entry.time,
			]),
		).toEqual([
			["coffee", "09:00"],
			["oats", undefined],
			["milk", "07:30"],
		]);
	});

	test("times skipped or repeated by a DST change are kept as written", async () => {
		const report = await setup({
			"2026-03-29": '[snack]\n02:30 "bottle of milk" kcal=120\n',
			"2026-10-25": '[snack]\n02:15 "tea" kcal=2\n02:45 "biscuit" kcal=60\n',
		})({ from: "2026-03-29", to: "2026-10-25", entries: true });

		expect(entriesOf(report).map((entry) => entry.time)).toEqual([
			"02:30",
			"02:15",
			"02:45",
		]);
	});

	test("times change no value, total or average", async () => {
		const range = { from: "2026-09-27", to: "2026-09-29", entries: true };

		const withTimes = await setup({
			"2026-09-27": timed,
			"2026-09-29": timed,
		})(range);
		const withoutTimes = await setup({
			"2026-09-27": untimed,
			"2026-09-29": untimed,
		})(range);

		expect(valuesOf(withTimes)).toEqual(valuesOf(withoutTimes));
		expect(withTimes.days[0]?.meals[0]?.totals.get("kcal")).toBeCloseTo(
			1 * 2.4 + 370 * 0.6 + 60 * 2,
			10,
		);
	});

	test("each day of a range with entries keeps its times", async () => {
		const report = await setup({
			"2026-09-23": "[breakfast]\n08:15 rice@1 80\noats@2 60 g\n",
			"2026-09-25": '[lunch]\n12:30 "restaurant ramen" kcal=800\n',
		})({ from: "2026-09-23", to: "2026-09-26", entries: true });

		expect(
			report.days.map((day) => [
				day.date,
				day.meals.flatMap((meal) => meal.entries?.map((e) => e.time) ?? []),
			]),
		).toEqual([
			["2026-09-23", ["08:15", undefined]],
			["2026-09-24", []],
			["2026-09-25", ["12:30"]],
			["2026-09-26", []],
		]);
	});
});

describe("strict reports", () => {
	test("collects the invalid lines of every day in the range", async () => {
		const error = await rejection(
			setup({
				"2026-09-10": "[lunch]\nrice@1 80\nrice@1 1\nrice 1\n",
				"2026-09-12": "[lunch]\nrice@1 80\n",
				"2026-09-17": "[lunch]\nrice\nrice@1 80\nrice@1 90\n\nrice@2 1\n",
			})({ from: "2026-09-01", to: "2026-09-30" }),
		);

		expect(error.message).toBe(
			"2 day files have errors; fix them to report on this range",
		);
		expect(error.problems.map(({ file, line }) => `${file}:${line}`)).toEqual([
			`${dayPath("2026-09-10")}:4`,
			`${dayPath("2026-09-17")}:2`,
			`${dayPath("2026-09-17")}:6`,
		]);
	});

	test("one invalid day names its file", async () => {
		const error = await rejection(
			setup({ "2026-09-10": "[lunch]\nrice 1\n" })({ from: "2026-09-10" }),
		);

		expect(error.message).toBe(
			`${dayPath("2026-09-10")} has errors; fix them to report on this day`,
		);
	});

	test("a recipe cycle found while calculating is located at the entry", async () => {
		const error = await rejection(
			setup({ "2026-09-29": "[lunch]\nrice@1 80\na@1 1 serving\n" })(),
		);

		expect(error.problems).toEqual([
			{
				file: dayPath("2026-09-29"),
				line: 3,
				message: "Recipes reference each other in a cycle: a@1 -> b@1 -> a@1",
			},
		]);
	});

	test("a day pinning an unusable food version fails at that line", async () => {
		const error = await rejection(
			setup({ "2026-09-29": "[lunch]\nrice@1 80\napple@1 150 g\n" })(),
		);

		expect(error.problems).toEqual([
			{
				file: dayPath("2026-09-29"),
				line: 3,
				message:
					"'apple@1' is unusable: the required nutrient 'kcal' is missing",
			},
		]);
	});

	test("an unknown meal only warns", async () => {
		const report = await setup({ "2026-09-29": "[brunch]\nrice@1 80\n" })();

		expect(report.warnings).toEqual([
			{
				file: dayPath("2026-09-29"),
				line: 1,
				message:
					"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
			},
		]);
		expect(report.days[0]?.totals.get("kcal")).toBeCloseTo(104, 10);
	});
});
