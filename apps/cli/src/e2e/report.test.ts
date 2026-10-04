import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, withSandbox } from "./nomnom";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

// Dates long past, so today is never in the range.
test("report calculates days and ranges from the day files", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const dayFile = (date: string) => join(dir, "logs", "2020", `${date}.nom`);

		// Foods, a recipe, and a recipe that contains it.
		for (const args of [
			[
				"--name",
				"Chicken Breast",
				"--base-unit",
				"g",
				"--kcal",
				"165",
				"--protein",
				"31",
			],
			[
				"--name",
				"Carrot",
				"--base-unit",
				"g",
				"--kcal",
				"41",
				"--fiber",
				"2.8",
				"--units",
				"medium carrot=61",
			],
			["--name", "Water", "--base-unit", "ml", "--kcal", "0"],
		]) {
			expectOk(await nomnom("food", "add", ...args));
		}
		expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Chicken Stock",
				"--base-unit",
				"g",
				"--yield",
				"2000",
				"--ingredient",
				"chicken-breast=1000 g",
				"--ingredient",
				"water=1500",
			),
		);
		expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Chicken Soup",
				"--servings",
				"2",
				"--ingredient",
				"chicken-stock=500 g",
				"--ingredient",
				"carrot=2 medium carrot",
			),
		);

		// 2020-02-28: carrot and a serving of the nested soup.
		const first = ["--date", "2020-02-28"];
		expectOk(
			await nomnom("log", "lunch", "chicken-soup", "1", "serving", ...first),
		);
		expectOk(
			await nomnom(
				"log",
				"breakfast",
				"carrot",
				"1",
				"medium",
				"carrot",
				...first,
			),
		);

		// 2020-02-29: an inline entry, then a hand-written section for an unknown meal.
		expectOk(
			await nomnom(
				"log",
				"dinner",
				"--inline",
				"restaurant ramen",
				"--kcal",
				"800",
				"--protein",
				"35",
				"--date",
				"2020-02-29",
			),
		);
		const second = dayFile("2020-02-29");
		await writeFile(
			second,
			`[brunch]\n"toast" kcal=120 carbs=20\n\n${await readFile(second, "utf8")}`,
		);
		const brunchWarning = `warning: ${second}:1: 'brunch' is not a meal in config.yaml; it is kept after the configured meals\n`;

		// One day. Soup: (412.5 + 50.02) / 2 kcal a serving; carrot: 61 g.
		expect(expectOk(await nomnom("report", "2020-02-28")).out).toBe(
			[
				"2020-02-28                  kcal  protein  fat  carbs  fiber",
				"                            kcal        g    g      g      g",
				"breakfast",
				"  Carrot  1 medium carrot   25.0      0.0  0.0    0.0    1.7",
				"  total                     25.0      0.0  0.0    0.0    1.7",
				"",
				"lunch",
				"  Chicken Soup  1 serving  231.3     38.8  0.0    0.0    1.7",
				"  total                    231.3     38.8  0.0    0.0    1.7",
				"",
				"day total                  256.3     38.8  0.0    0.0    3.4",
				"",
			].join("\n"),
		);

		// The unknown meal comes after the configured ones and only warns.
		const withBrunch = await nomnom("report", "2020-02-29");
		expect(withBrunch.code).toBe(0);
		expect(withBrunch.err).toBe(brunchWarning);
		expect(withBrunch.out).toBe(
			[
				"2020-02-29             kcal  protein  fat  carbs  fiber",
				"                       kcal        g    g      g      g",
				"dinner",
				'  "restaurant ramen"  800.0     35.0  0.0    0.0    0.0',
				"  total               800.0     35.0  0.0    0.0    0.0",
				"",
				"brunch",
				'  "toast"             120.0      0.0  0.0   20.0    0.0',
				"  total               120.0      0.0  0.0   20.0    0.0",
				"",
				"day total             920.0     35.0  0.0   20.0    0.0",
				"",
			].join("\n"),
		);

		// A range, crossing the end of February.
		const range = await nomnom("report", "2020-02-27", "2020-03-01");
		expect(range.code).toBe(0);
		expect(range.err).toBe(brunchWarning);
		expect(range.out).toBe(
			[
				"              kcal  protein  fat  carbs  fiber",
				"              kcal        g    g      g      g",
				"2020-02-27       -        -    -      -      -",
				"2020-02-28   256.3     38.8  0.0    0.0    3.4",
				"2020-02-29   920.0     35.0  0.0   20.0    0.0",
				"2020-03-01       -        -    -      -      -",
				"total       1176.3     73.8  0.0   20.0    3.4  2 logged days",
				"average      588.1     36.9  0.0   10.0    1.7  2 of 4 days",
				"",
			].join("\n"),
		);

		// The same range as JSON.
		const json = await nomnom("report", "2020-02-27", "2020-03-01", "--json");
		expect(json.code).toBe(0);
		expect(json.err).toBe(brunchWarning);
		const document = JSON.parse(json.out);
		expect(document).toMatchObject({
			from: "2020-02-27",
			to: "2020-03-01",
			loggedDays: 2,
			totals: { kcal: 1176.27, protein: 73.75, fat: 0, carbs: 20, fiber: 3.42 },
			averageDays: ["2020-02-28", "2020-02-29"],
			warnings: [
				{
					file: second,
					line: 1,
					message:
						"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
				},
			],
		});
		expect(document.average.kcal).toBeCloseTo(588.135, 2);
		expect(
			document.days.map((day: { date: string; logged: boolean }) => [
				day.date,
				day.logged,
			]),
		).toEqual([
			["2020-02-27", false],
			["2020-02-28", true],
			["2020-02-29", true],
			["2020-03-01", false],
		]);
		expect(
			document.days[2].meals.map(
				(meal: { meal: string; configured: boolean }) => [
					meal.meal,
					meal.configured,
				],
			),
		).toEqual([
			["dinner", true],
			["brunch", false],
		]);
		expect(document.days[2].meals[0]).not.toHaveProperty("entries");

		// A broken day fails the whole report, naming its file and line.
		const firstFile = dayFile("2020-02-28");
		await writeFile(
			firstFile,
			(await readFile(firstFile, "utf8")).replace("carrot@1", "carrot"),
		);
		for (const args of [[], ["--json"]]) {
			const broken = await nomnom(
				"report",
				"2020-02-27",
				"2020-03-01",
				...args,
			);
			expect(broken.code).toBe(1);
			expect(broken.out).toBe("");
			expect(broken.err).toContain(`${firstFile}:2: 'carrot' needs a version`);
		}
	}));

// Hand-written day files with made-up items. Dates long past, so today is never in a range.
test("report shows entry times in text and JSON without changing any value", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const writeDay = async (date: string, lines: string[]) => {
			await mkdir(join(dir, "logs", "2026"), { recursive: true });
			await writeFile(
				join(dir, "logs", "2026", `${date}.nom`),
				`${lines.join("\n")}\n`,
			);
		};
		const text = (...lines: string[]) => `${[...lines, ""].join("\n")}`;

		// apple@2, coffee@1, oats@2 and milk@1.
		const apple = [
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"50",
			"--units",
			"medium sized apple=200",
		];
		const oats = ["--name", "Oats", "--base-unit", "g", "--kcal", "380"];
		expectOk(await nomnom("food", "add", ...apple));
		expectOk(
			await nomnom(
				"food",
				"update",
				"apple",
				...apple,
				"--protein",
				"0.3",
				"--carbs",
				"12",
				"--fiber",
				"2.4",
			),
		);
		expectOk(await nomnom("food", "add", ...oats));
		expectOk(
			await nomnom(
				"food",
				"update",
				"oats",
				...oats,
				"--protein",
				"13",
				"--carbs",
				"60",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Coffee",
				"--base-unit",
				"ml",
				"--kcal",
				"1",
				"--units",
				"cup=250",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Milk",
				"--base-unit",
				"ml",
				"--kcal",
				"60",
				"--protein",
				"3.2",
				"--fat",
				"3.5",
			),
		);

		const timedDay = [
			"[breakfast]",
			"08:15 apple@2 1 medium sized apple",
			"",
			"[dinner]",
			'19:30 "restaurant ramen" kcal=800 protein=35',
		];
		const withoutTimes = (lines: string[]) =>
			lines.map((line) => line.replace(/^\d\d:\d\d /, ""));
		await writeDay("2026-09-29", timedDay);
		await writeDay("2026-09-28", withoutTimes(timedDay));
		await writeDay("2026-09-27", [
			"[breakfast]",
			"09:00 coffee@1 1 cup",
			"oats@2 60 g",
			"07:30 milk@1 200 ml",
		]);
		await writeDay("2026-09-23", [
			"[breakfast]",
			"08:15 apple@2 1 medium sized apple",
			"oats@2 60 g",
			"",
			"[lunch]",
			'12:30 "restaurant ramen" kcal=800',
		]);
		await writeDay("2026-09-25", ["[dinner]", '"soup" kcal=300']);

		// Timed entries: the time before the name or the description.
		expect(expectOk(await nomnom("report", "2026-09-29")).out).toBe(
			text(
				"2026-09-29                            kcal  protein  fat  carbs  fiber",
				"                                      kcal        g    g      g      g",
				"breakfast",
				"  08:15 Apple  1 medium sized apple  100.0      0.6  0.0   24.0    4.8",
				"  total                              100.0      0.6  0.0   24.0    4.8",
				"",
				"dinner",
				'  19:30 "restaurant ramen"           800.0     35.0  0.0    0.0    0.0',
				"  total                              800.0     35.0  0.0    0.0    0.0",
				"",
				"day total                            900.0     35.6  0.0   24.0    4.8",
			),
		);

		// A day without times: the same lines, values and totals as before times.
		expect(expectOk(await nomnom("report", "2026-09-28")).out).toBe(
			text(
				"2026-09-28                      kcal  protein  fat  carbs  fiber",
				"                                kcal        g    g      g      g",
				"breakfast",
				"  Apple  1 medium sized apple  100.0      0.6  0.0   24.0    4.8",
				"  total                        100.0      0.6  0.0   24.0    4.8",
				"",
				"dinner",
				'  "restaurant ramen"           800.0     35.0  0.0    0.0    0.0',
				"  total                        800.0     35.0  0.0    0.0    0.0",
				"",
				"day total                      900.0     35.6  0.0   24.0    4.8",
			),
		);

		// Timed and untimed entries in a meal: file order, no placeholder.
		expect(expectOk(await nomnom("report", "2026-09-27")).out).toBe(
			text(
				"2026-09-27              kcal  protein  fat  carbs  fiber",
				"                        kcal        g    g      g      g",
				"breakfast",
				"  09:00 Coffee  1 cup    2.5      0.0  0.0    0.0    0.0",
				"  Oats  60 g           228.0      7.8  0.0   36.0    0.0",
				"  07:30 Milk  200 ml   120.0      6.4  7.0    0.0    0.0",
				"  total                350.5     14.2  7.0   36.0    0.0",
				"",
				"day total              350.5     14.2  7.0   36.0    0.0",
			),
		);

		// Range with timed entries, and the same range once the times are removed.
		const range = ["report", "2026-09-23", "2026-09-26", "--entries"];
		const timedRange = expectOk(await nomnom(...range)).out;
		const rangeRows = (out: string) => out.split("\n").slice(-9);
		expect(timedRange).toBe(
			text(
				"2026-09-23                             kcal  protein  fat  carbs  fiber",
				"                                       kcal        g    g      g      g",
				"breakfast",
				"  08:15 Apple  1 medium sized apple   100.0      0.6  0.0   24.0    4.8",
				"  Oats  60 g                          228.0      7.8  0.0   36.0    0.0",
				"  total                               328.0      8.4  0.0   60.0    4.8",
				"",
				"lunch",
				'  12:30 "restaurant ramen"            800.0      0.0  0.0    0.0    0.0',
				"  total                               800.0      0.0  0.0    0.0    0.0",
				"",
				"day total                            1128.0      8.4  0.0   60.0    4.8",
				"",
				"2026-09-25   kcal  protein  fat  carbs  fiber",
				"             kcal        g    g      g      g",
				"dinner",
				'  "soup"    300.0      0.0  0.0    0.0    0.0',
				"  total     300.0      0.0  0.0    0.0    0.0",
				"",
				"day total   300.0      0.0  0.0    0.0    0.0",
				"",
				"              kcal  protein  fat  carbs  fiber",
				"              kcal        g    g      g      g",
				"2026-09-23  1128.0      8.4  0.0   60.0    4.8",
				"2026-09-24       -        -    -      -      -",
				"2026-09-25   300.0      0.0  0.0    0.0    0.0",
				"2026-09-26       -        -    -      -      -",
				"total       1428.0      8.4  0.0   60.0    4.8  2 logged days",
				"average      714.0      4.2  0.0   30.0    2.4  2 of 4 days",
			),
		);

		const json = async (...args: string[]) =>
			JSON.parse(expectOk(await nomnom("report", ...args, "--json")).out);
		const timedJson = await json("2026-09-23", "2026-09-29", "--entries");

		// Range as JSON with entries: 12:30 is shown and every entry has `time`.
		type Day = {
			date: string;
			meals: { meal: string; entries: Record<string, unknown>[] }[];
		};
		const lunch = (timedJson.days as Day[])
			.find((day) => day.date === "2026-09-23")
			?.meals.find((meal) => meal.meal === "lunch");
		expect(lunch?.entries).toEqual([
			expect.objectContaining({
				kind: "inline",
				time: "12:30",
				description: "restaurant ramen",
			}),
		]);
		const times = (timedJson.days as Day[]).flatMap((day) =>
			day.meals.flatMap((meal) =>
				meal.entries.map((entry) => {
					expect(Object.hasOwn(entry, "time")).toBe(true);
					return [day.date, entry.time];
				}),
			),
		);
		expect(times).toEqual([
			["2026-09-23", "08:15"],
			["2026-09-23", null],
			["2026-09-23", "12:30"],
			["2026-09-25", null],
			["2026-09-27", "09:00"],
			["2026-09-27", null],
			["2026-09-27", "07:30"],
			["2026-09-28", null],
			["2026-09-28", null],
			["2026-09-29", "08:15"],
			["2026-09-29", "19:30"],
		]);

		// Timed entries as JSON.
		await writeDay("2026-09-30", [
			"[breakfast]",
			"09:00 coffee@1 1 cup",
			"oats@2 60 g",
		]);
		const timedEntries = await json("2026-09-30");
		const breakfastTotals = {
			kcal: 230.5,
			protein: 7.8,
			fat: 0,
			carbs: 36,
			fiber: 0,
		};
		expect(timedEntries.days[0].meals).toEqual([
			{
				meal: "breakfast",
				configured: true,
				totals: breakfastTotals,
				entries: [
					{
						line: 2,
						kind: "reference",
						time: "09:00",
						slug: "coffee",
						version: 1,
						item: "food",
						name: "Coffee",
						amount: 1,
						unit: "cup",
						nutrients: { kcal: 2.5, protein: 0, fat: 0, carbs: 0, fiber: 0 },
					},
					{
						line: 3,
						kind: "reference",
						time: null,
						slug: "oats",
						version: 2,
						item: "food",
						name: "Oats",
						amount: 60,
						unit: "g",
						nutrients: { kcal: 228, protein: 7.8, fat: 0, carbs: 36, fiber: 0 },
					},
				],
			},
		]);
		expect(timedEntries.days[0].totals).toEqual(breakfastTotals);

		// Day report as JSON: an untimed entry has `time` null.
		await writeDay("2026-10-01", [
			"[dinner]",
			'"restaurant ramen" kcal=800 protein=35',
		]);
		const untimed = await json("2026-10-01");
		expect(untimed).toMatchObject({ from: "2026-10-01", to: "2026-10-01" });
		expect(untimed.days[0].meals[0].entries).toEqual([
			{
				line: 2,
				kind: "inline",
				time: null,
				description: "restaurant ramen",
				nutrients: { kcal: 800, protein: 35, fat: 0, carbs: 0, fiber: 0 },
			},
		]);

		// Removing every time changes no value, total or average.
		const untimedRangeJson = await (async () => {
			for (const date of [
				"2026-09-23",
				"2026-09-27",
				"2026-09-29",
				"2026-09-30",
			]) {
				const file = join(dir, "logs", "2026", `${date}.nom`);
				await writeFile(
					file,
					withoutTimes((await readFile(file, "utf8")).split("\n")).join("\n"),
				);
			}
			return json("2026-09-23", "2026-09-29", "--entries");
		})();
		const noTimes = (document: unknown): unknown =>
			JSON.parse(JSON.stringify(document), (key, value) =>
				key === "time" ? undefined : value,
			);
		expect(noTimes(timedJson)).toEqual(noTimes(untimedRangeJson));
		expect(rangeRows(expectOk(await nomnom(...range)).out)).toEqual(
			rangeRows(timedRange),
		);
	}));
