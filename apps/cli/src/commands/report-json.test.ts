import { expect, test } from "bun:test";
import {
	appleEntry,
	day,
	meal,
	nutrients,
	ramenEntry,
	report,
} from "../__mocks__/report";
import { reportJson } from "./report-json";

const catalog = [
	{ id: "kcal", name: "Energy", unit: "kcal" },
	{ id: "protein", name: "Protein", unit: "g" },
	{ id: "fat", name: "Fat", unit: "g" },
	{ id: "carbs", name: "Carbohydrates", unit: "g" },
	{ id: "fiber", name: "Fiber", unit: "g" },
];
const zero = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
const ramen = { ...zero, kcal: 800, protein: 35 };
const file = (date: string) => `/data/logs/2026/${date}.nom`;

test("a day report", () => {
	const warning = { file: file("2026-09-29"), line: 7, message: "brunch" };
	const document = reportJson(
		report(
			[
				day("2026-09-29", [
					meal("breakfast", [appleEntry]),
					meal("dinner", [ramenEntry], { configured: false }),
				]),
			],
			{ today: "2026-10-01", warnings: [warning] },
		),
	);

	const apple = {
		kcal: 94.64,
		protein: 0.47,
		fat: 0.31,
		carbs: 25.13,
		fiber: 4.37,
	};
	const dayTotals = {
		kcal: 894.64,
		protein: 35.47,
		fat: 0.31,
		carbs: 25.13,
		fiber: 4.37,
	};
	expect(document).toEqual({
		from: "2026-09-29",
		to: "2026-09-29",
		nutrients: catalog,
		days: [
			{
				date: "2026-09-29",
				file: file("2026-09-29"),
				logged: true,
				meals: [
					{
						meal: "breakfast",
						configured: true,
						totals: apple,
						entries: [
							{
								line: 2,
								kind: "reference",
								slug: "apple",
								version: 2,
								item: "food",
								name: "Apple",
								amount: 1,
								unit: "medium sized apple",
								nutrients: apple,
							},
						],
					},
					{
						meal: "dinner",
						configured: false,
						totals: ramen,
						entries: [
							{
								line: 5,
								kind: "inline",
								description: "restaurant ramen",
								nutrients: ramen,
							},
						],
					},
				],
				totals: dayTotals,
			},
		],
		loggedDays: 1,
		totals: dayTotals,
		averageDays: ["2026-09-29"],
		average: dayTotals,
		warnings: [warning],
	});
	// Keys in catalog order.
	expect(JSON.stringify(document)).toContain(
		'"totals":{"kcal":894.64,"protein":35.47,"fat":0.31,"carbs":25.13,"fiber":4.37}',
	);
});

test("a range without entries rounds to two decimal places", () => {
	const third = (kcal: number) => ({
		...ramenEntry,
		nutrients: nutrients({ kcal, fat: -0.001 }),
	});
	const document = reportJson(
		report([
			day("2026-09-27", [
				meal("lunch", [third(1000 / 3)], { withEntries: false }),
			]),
			day("2026-09-28"),
			day("2026-09-29", [meal("lunch", [third(500)], { withEntries: false })]),
		]),
	) as Record<string, unknown>;

	expect(document.days).toEqual([
		{
			date: "2026-09-27",
			file: file("2026-09-27"),
			logged: true,
			meals: [
				{
					meal: "lunch",
					configured: true,
					totals: { ...zero, kcal: 333.33 },
				},
			],
			totals: { ...zero, kcal: 333.33 },
		},
		{
			date: "2026-09-28",
			file: file("2026-09-28"),
			logged: false,
			meals: [],
			totals: zero,
		},
		{
			date: "2026-09-29",
			file: file("2026-09-29"),
			logged: true,
			meals: [
				{ meal: "lunch", configured: true, totals: { ...zero, kcal: 500 } },
			],
			totals: { ...zero, kcal: 500 },
		},
	]);
	expect(document).toMatchObject({
		from: "2026-09-27",
		to: "2026-09-29",
		loggedDays: 2,
		totals: { ...zero, kcal: 833.33 },
		averageDays: ["2026-09-27"],
		average: { ...zero, kcal: 333.33 },
		warnings: [],
	});
	expect(Object.is((document.totals as { fat: number }).fat, 0)).toBe(true);
});

test("a day with nothing logged", () => {
	expect(reportJson(report([day("2026-09-20")]))).toEqual({
		from: "2026-09-20",
		to: "2026-09-20",
		nutrients: catalog,
		days: [
			{
				date: "2026-09-20",
				file: file("2026-09-20"),
				logged: false,
				meals: [],
				totals: zero,
			},
		],
		loggedDays: 0,
		totals: zero,
		averageDays: [],
		average: null,
		warnings: [],
	});
});
