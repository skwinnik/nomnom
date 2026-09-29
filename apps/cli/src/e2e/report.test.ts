import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
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
