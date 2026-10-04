import type {
	Nutrient,
	Nutrients,
	Report,
	ReportDay,
	ReportEntry,
} from "@nomnom/core";

/** A table row: a label alone, a label with values (`null`: nothing logged), or a blank line. */
type Row =
	| { label: string; values?: Nutrients | null; note?: string }
	| "blank";

/** A report as text: a day table, or a range table after each logged day's table when entries are included. */
export function formatReport(report: Report): string {
	if (report.kind === "day") {
		const [day] = report.days;
		return day ? formatDay(day, report.nutrients) : "";
	}
	return formatRange(report);
}

/** One day's meals, entries and totals, or a line saying nothing was logged. */
export function formatDay(
	day: ReportDay,
	nutrients: readonly Nutrient[],
): string {
	if (!day.logged) return `${day.date}: nothing logged\n`;
	const rows: Row[] = [];
	for (const meal of day.meals) {
		rows.push({ label: meal.meal });
		for (const entry of meal.entries ?? []) {
			rows.push({ label: `  ${entryLabel(entry)}`, values: entry.nutrients });
		}
		rows.push({ label: "  total", values: meal.totals }, "blank");
	}
	rows.push({ label: "day total", values: day.totals });
	return renderTable(day.date, nutrients, rows);
}

/** One row per date, the range total and the average per logged day. */
export function formatRange(report: Report): string {
	const withEntries = report.days.some((day) =>
		day.meals.some((meal) => meal.entries !== undefined),
	);
	const dayTables = withEntries
		? report.days
				.filter((day) => day.logged)
				.map((day) => `${formatDay(day, report.nutrients)}\n`)
		: [];

	const rows: Row[] = report.days.map((day) => ({
		label: day.date,
		values: day.logged ? day.totals : null,
	}));
	const loggedDays = `${report.loggedDays} logged ${report.loggedDays === 1 ? "day" : "days"}`;
	rows.push({ label: "total", values: report.totals, note: loggedDays });
	const todayLeftOut = report.days.some(
		(day) => day.date === report.today && day.logged,
	);
	rows.push({
		label: "average",
		values: report.average ?? null,
		note: `${report.averageDays.length} of ${report.days.length} days${todayLeftOut ? ", today left out" : ""}`,
	});
	return dayTables.join("") + renderTable("", report.nutrients, rows);
}

/** The time first when the entry has one; an untimed label has no placeholder. */
function entryLabel(entry: ReportEntry): string {
	const label =
		entry.kind === "reference"
			? `${entry.name}  ${entry.amount} ${entry.unit}`
			: `"${entry.description}"`;
	return entry.time === undefined ? label : `${entry.time} ${label}`;
}

/** Right-aligned nutrient columns after a label column that fits the longest label. */
function renderTable(
	title: string,
	nutrients: readonly Nutrient[],
	rows: readonly Row[],
): string {
	const cells = rows.map((row) => {
		if (row === "blank" || row.values === undefined) return undefined;
		const { values } = row;
		return nutrients.map(({ id }) =>
			values === null ? "-" : formatValue(values.get(id) ?? 0),
		);
	});
	const widths = nutrients.map((nutrient, i) =>
		Math.max(
			nutrient.id.length,
			nutrient.unit.length,
			...cells.map((row) => row?.[i]?.length ?? 0),
		),
	);
	const labelWidth = Math.max(
		title.length,
		...rows.map((row) => (row === "blank" ? 0 : row.label.length)),
	);
	const line = (label: string, columns?: readonly string[], note?: string) => {
		if (columns === undefined) return label;
		const values = columns.map(
			(text, i) => `  ${text.padStart(widths[i] ?? 0)}`,
		);
		return `${label.padEnd(labelWidth)}${values.join("")}${note ? `  ${note}` : ""}`;
	};

	const lines = [
		line(
			title,
			nutrients.map(({ id }) => id),
		),
		line(
			"",
			nutrients.map(({ unit }) => unit),
		),
		...rows.map((row, i) =>
			row === "blank" ? "" : line(row.label, cells[i], row.note),
		),
	];
	return `${lines.join("\n")}\n`;
}

/** One decimal place, without a sign on zero. */
function formatValue(value: number): string {
	const text = value.toFixed(1);
	return text === "-0.0" ? "0.0" : text;
}
