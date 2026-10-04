import { describe, expect, test } from "bun:test";
import type { ReportDay, ReportEntry } from "@nomnom/core";
import {
	appleEntry,
	day,
	meal,
	nutrients,
	ramenEntry,
	report,
} from "../__mocks__/report";
import { formatReport } from "./report-text";

const toast: ReportEntry = {
	line: 8,
	time: undefined,
	kind: "inline",
	description: "toast",
	nutrients: nutrients({ kcal: 120 }),
};

/** An inline entry with `kcal` and a twentieth of it as protein. */
const eaten = (kcal: number): ReportEntry => ({
	line: 2,
	time: undefined,
	kind: "inline",
	description: "food",
	nutrients: nutrients({ kcal, protein: kcal / 20 }),
});

const lines = (...text: string[]) => `${text.join("\n")}\n`;

describe("day report", () => {
	test("groups entries by meal with totals, zeros included", () => {
		const text = formatReport(
			report([
				day("2026-09-29", [
					meal("breakfast", [appleEntry]),
					meal("dinner", [ramenEntry]),
					meal("brunch", [toast], { configured: false }),
				]),
			]),
		);

		expect(text).toBe(
			lines(
				"2026-09-29                       kcal  protein  fat  carbs  fiber",
				"                                 kcal        g    g      g      g",
				"breakfast",
				"  Apple  1 medium sized apple    94.6      0.5  0.3   25.1    4.4",
				"  total                          94.6      0.5  0.3   25.1    4.4",
				"",
				"dinner",
				'  "restaurant ramen"            800.0     35.0  0.0    0.0    0.0',
				"  total                         800.0     35.0  0.0    0.0    0.0",
				"",
				"brunch",
				'  "toast"                       120.0      0.0  0.0    0.0    0.0',
				"  total                         120.0      0.0  0.0    0.0    0.0",
				"",
				"day total                      1014.6     35.5  0.3   25.1    4.4",
			),
		);
	});

	test("says when nothing was logged", () => {
		expect(formatReport(report([day("2026-09-20")]))).toBe(
			"2026-09-20: nothing logged\n",
		);
	});
});

describe("entry times", () => {
	const reference = (
		line: number,
		time: string | undefined,
		name: string,
		amount: number,
		unit: string,
		values: Record<string, number>,
	): ReportEntry => ({
		line,
		time,
		kind: "reference",
		slug: name.toLowerCase(),
		version: 1,
		item: "food",
		name,
		amount,
		unit,
		nutrients: nutrients(values),
	});

	test("a timed entry's label starts with its time", () => {
		const text = formatReport(
			report([
				day("2026-09-29", [
					meal("breakfast", [{ ...appleEntry, time: "08:15" }]),
					meal("dinner", [{ ...ramenEntry, time: "19:30" }]),
				]),
			]),
		);

		expect(text).toBe(
			lines(
				"2026-09-29                            kcal  protein  fat  carbs  fiber",
				"                                      kcal        g    g      g      g",
				"breakfast",
				"  08:15 Apple  1 medium sized apple   94.6      0.5  0.3   25.1    4.4",
				"  total                               94.6      0.5  0.3   25.1    4.4",
				"",
				"dinner",
				'  19:30 "restaurant ramen"           800.0     35.0  0.0    0.0    0.0',
				"  total                              800.0     35.0  0.0    0.0    0.0",
				"",
				"day total                            894.6     35.5  0.3   25.1    4.4",
			),
		);
	});

	test("a mixed meal keeps file order, untimed labels get no placeholder, and the label column fits the longest label", () => {
		const text = formatReport(
			report([
				day("2026-09-29", [
					meal("breakfast", [
						reference(2, "09:00", "Coffee", 1, "cup", { kcal: 2.4 }),
						reference(3, undefined, "Oats", 60, "g", {
							kcal: 222,
							protein: 7.8,
							carbs: 36,
						}),
						reference(4, "07:30", "Milk", 200, "ml", {
							kcal: 120,
							protein: 6.4,
							fat: 6.6,
						}),
					]),
				]),
			]),
		);

		expect(text).toBe(
			lines(
				"2026-09-29              kcal  protein  fat  carbs  fiber",
				"                        kcal        g    g      g      g",
				"breakfast",
				"  09:00 Coffee  1 cup    2.4      0.0  0.0    0.0    0.0",
				"  Oats  60 g           222.0      7.8  0.0   36.0    0.0",
				"  07:30 Milk  200 ml   120.0      6.4  6.6    0.0    0.0",
				"  total                344.4     14.2  6.6   36.0    0.0",
				"",
				"day total              344.4     14.2  6.6   36.0    0.0",
			),
		);
	});

	test("a day without times renders as before", () => {
		const untimed = report([
			day("2026-09-29", [
				meal("breakfast", [appleEntry]),
				meal("dinner", [ramenEntry]),
			]),
		]);

		expect(formatReport(untimed)).toBe(
			lines(
				"2026-09-29                      kcal  protein  fat  carbs  fiber",
				"                                kcal        g    g      g      g",
				"breakfast",
				"  Apple  1 medium sized apple   94.6      0.5  0.3   25.1    4.4",
				"  total                         94.6      0.5  0.3   25.1    4.4",
				"",
				"dinner",
				'  "restaurant ramen"           800.0     35.0  0.0    0.0    0.0',
				"  total                        800.0     35.0  0.0    0.0    0.0",
				"",
				"day total                      894.6     35.5  0.3   25.1    4.4",
			),
		);
	});

	test("a range with entries shows each day's times", () => {
		const timedDay = day("2026-09-23", [
			meal("breakfast", [
				{ ...appleEntry, time: "08:15" },
				reference(3, undefined, "Oats", 60, "g", { kcal: 222 }),
			]),
		]);

		const text = formatReport(report([timedDay, day("2026-09-24")]));

		const dayTable = formatReport(report([timedDay]));
		expect(dayTable).toContain("\n  08:15 Apple  1 medium sized apple   94.6");
		expect(dayTable).toContain("\n  Oats  60 g                         222.0");
		expect(text).toStartWith(`${dayTable}\n`);
	});
});

describe("range report", () => {
	const withoutEntries = (d: ReportDay): ReportDay => ({
		...d,
		meals: d.meals.map(({ entries: _, ...rest }) => rest),
	});
	const days = [
		day("2026-09-26", [meal("lunch", [eaten(2000)])]),
		day("2026-09-27"),
		day("2026-09-28", [meal("lunch", [eaten(1850.25)])]),
		day("2026-09-29", [meal("lunch", [eaten(500)])]),
	];
	const rangeTable = lines(
		"              kcal  protein  fat  carbs  fiber",
		"              kcal        g    g      g      g",
		"2026-09-26  2000.0    100.0  0.0    0.0    0.0",
		"2026-09-27       -        -    -      -      -",
		"2026-09-28  1850.3     92.5  0.0    0.0    0.0",
		"2026-09-29   500.0     25.0  0.0    0.0    0.0",
		"total       4350.3    217.5  0.0    0.0    0.0  3 logged days",
		"average     1925.1     96.3  0.0    0.0    0.0  2 of 4 days, today left out",
	);

	test("one row per date, the total and the average", () => {
		expect(formatReport(report(days.map(withoutEntries)))).toBe(rangeTable);
	});

	test("each logged day's table comes first when entries are included", () => {
		expect(formatReport(report(days))).toBe(
			lines(
				"2026-09-26    kcal  protein  fat  carbs  fiber",
				"              kcal        g    g      g      g",
				"lunch",
				'  "food"    2000.0    100.0  0.0    0.0    0.0',
				"  total     2000.0    100.0  0.0    0.0    0.0",
				"",
				"day total   2000.0    100.0  0.0    0.0    0.0",
				"",
				"2026-09-28    kcal  protein  fat  carbs  fiber",
				"              kcal        g    g      g      g",
				"lunch",
				'  "food"    1850.3     92.5  0.0    0.0    0.0',
				"  total     1850.3     92.5  0.0    0.0    0.0",
				"",
				"day total   1850.3     92.5  0.0    0.0    0.0",
				"",
				"2026-09-29   kcal  protein  fat  carbs  fiber",
				"             kcal        g    g      g      g",
				"lunch",
				'  "food"    500.0     25.0  0.0    0.0    0.0',
				"  total     500.0     25.0  0.0    0.0    0.0",
				"",
				"day total   500.0     25.0  0.0    0.0    0.0",
				"",
			) + rangeTable,
		);
	});

	test("today outside the range is not mentioned", () => {
		const text = formatReport(
			report(days.slice(0, 3).map(withoutEntries), { today: "2026-10-05" }),
		);

		expect(text).toEndWith(
			"average     1925.1     96.3  0.0    0.0    0.0  2 of 3 days\n",
		);
	});

	test("shows no average values when there is none", () => {
		const text = formatReport(
			report(
				[
					day("2026-09-28"),
					withoutEntries(day("2026-09-29", [meal("lunch", [eaten(500)])])),
				],
				{ kind: "range" },
			),
		);

		expect(text).toBe(
			lines(
				"             kcal  protein  fat  carbs  fiber",
				"             kcal        g    g      g      g",
				"2026-09-28      -        -    -      -      -",
				"2026-09-29  500.0     25.0  0.0    0.0    0.0",
				"total       500.0     25.0  0.0    0.0    0.0  1 logged day",
				"average         -        -    -      -      -  0 of 2 days, today left out",
			),
		);
	});
});
