import type {
	Nutrients,
	Report,
	ReportDay,
	ReportEntry,
	ReportMeal,
} from "@nomnom/core";
import { defaultContext } from "./context";

const nutrientIds = defaultContext.config.nutrients.map(({ id }) => id);

/** A value for every default catalog nutrient, 0 unless given. */
export function nutrients(values: Record<string, number> = {}): Nutrients {
	return new Map(nutrientIds.map((id) => [id, values[id] ?? 0]));
}

function sum(parts: readonly Nutrients[]): Nutrients {
	const values: Record<string, number> = {};
	for (const part of parts) {
		for (const [id, value] of part) values[id] = (values[id] ?? 0) + value;
	}
	return nutrients(values);
}

export function meal(
	name: string,
	entries: ReportEntry[],
	fields: { configured?: boolean; withEntries?: boolean } = {},
): ReportMeal {
	return {
		meal: name,
		configured: fields.configured ?? true,
		totals: sum(entries.map((entry) => entry.nutrients)),
		...(fields.withEntries === false ? {} : { entries }),
	};
}

export function day(date: string, meals: ReportMeal[] = []): ReportDay {
	return {
		date,
		path: `/data/logs/${date.slice(0, 4)}/${date}.nom`,
		logged: meals.length > 0,
		meals,
		totals: sum(meals.map((m) => m.totals)),
	};
}

/** A report over `days`, with totals and the average calculated as core does. */
export function report(
	days: ReportDay[],
	fields: Partial<Pick<Report, "kind" | "today" | "warnings">> = {},
): Report {
	const today = fields.today ?? "2026-09-29";
	const logged = days.filter((d) => d.logged);
	const averaged = logged.filter((d) => d.date !== today);
	const averageTotals = sum(averaged.map((d) => d.totals));
	return {
		kind: fields.kind ?? (days.length === 1 ? "day" : "range"),
		from: days[0]?.date ?? today,
		to: days.at(-1)?.date ?? today,
		today,
		nutrients: defaultContext.config.nutrients,
		days,
		loggedDays: logged.length,
		totals: sum(logged.map((d) => d.totals)),
		averageDays: averaged.map((d) => d.date),
		average:
			averaged.length === 0
				? undefined
				: new Map(
						[...averageTotals].map(([id, v]) => [id, v / averaged.length]),
					),
		warnings: fields.warnings ?? [],
	};
}

/** `apple@2 1 medium sized apple` under breakfast. */
export const appleEntry: ReportEntry = {
	line: 2,
	time: undefined,
	kind: "reference",
	slug: "apple",
	version: 2,
	item: "food",
	name: "Apple",
	amount: 1,
	unit: "medium sized apple",
	nutrients: nutrients({
		kcal: 94.64,
		protein: 0.47,
		fat: 0.31,
		carbs: 25.13,
		fiber: 4.37,
	}),
};

/** `"restaurant ramen" kcal=800 protein=35` under dinner. */
export const ramenEntry: ReportEntry = {
	line: 5,
	time: undefined,
	kind: "inline",
	description: "restaurant ramen",
	nutrients: nutrients({ kcal: 800, protein: 35 }),
};
