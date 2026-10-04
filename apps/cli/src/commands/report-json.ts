import type { Nutrient, Nutrients, Report, ReportEntry } from "@nomnom/core";

/**
 * The report as the JSON document agents read. Its shape is the same for a
 * day and a range; every nutrient set has every catalog nutrient, in catalog
 * order, rounded to two decimal places.
 */
export function reportJson(report: Report): unknown {
	const values = (nutrients: Nutrients) =>
		nutrientObject(report.nutrients, nutrients);
	return {
		from: report.from,
		to: report.to,
		nutrients: report.nutrients.map(({ id, name, unit }) => ({
			id,
			name,
			unit,
		})),
		days: report.days.map((day) => ({
			date: day.date,
			file: day.path,
			logged: day.logged,
			meals: day.meals.map((meal) => ({
				meal: meal.meal,
				configured: meal.configured,
				totals: values(meal.totals),
				...(meal.entries === undefined
					? {}
					: { entries: meal.entries.map((entry) => entryJson(entry, values)) }),
			})),
			totals: values(day.totals),
		})),
		loggedDays: report.loggedDays,
		totals: values(report.totals),
		averageDays: report.averageDays,
		average: report.average === undefined ? null : values(report.average),
		warnings: report.warnings.map(({ file, line, message }) => ({
			file,
			line,
			message,
		})),
	};
}

function entryJson(
	entry: ReportEntry,
	values: (nutrients: Nutrients) => Record<string, number>,
) {
	const nutrients = values(entry.nutrients);
	// Every entry has `time`, `null` when it has none.
	const time = entry.time ?? null;
	if (entry.kind === "inline") {
		return {
			line: entry.line,
			kind: entry.kind,
			time,
			description: entry.description,
			nutrients,
		};
	}
	const { line, kind, slug, version, item, name, amount, unit } = entry;
	return {
		line,
		kind,
		time,
		slug,
		version,
		item,
		name,
		amount,
		unit,
		nutrients,
	};
}

function nutrientObject(
	catalog: readonly Nutrient[],
	nutrients: Nutrients,
): Record<string, number> {
	const result: Record<string, number> = {};
	for (const { id } of catalog) {
		const rounded = Math.round((nutrients.get(id) ?? 0) * 100) / 100;
		// Normalises -0, which JSON.stringify would print as 0 anyway.
		result[id] = rounded === 0 ? 0 : rounded;
	}
	return result;
}
