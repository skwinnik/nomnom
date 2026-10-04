import type { Catalog } from "../catalog/catalog";
import { measureOf } from "../catalog/units";
import type { Clock } from "../clock/clock";
import type { Config, Nutrient } from "../config/config";
import type { ConfigService } from "../config/config-service";
import type { DataPaths } from "../data-dir/paths";
import { type DayLine, isEntry, type LineContent } from "../daylog/parse";
import { readDay } from "../daylog/read-day";
import { NomnomError, type Problem } from "../errors";
import type { FileSystem } from "../fs/file-system";
import type { Nutrients, Nutrition } from "../nutrition/nutrition";
import { datesBetween, isIsoDate, localDate } from "../shared/time";
import type { ItemKind } from "../store/records";

/** A report request as typed on the command line: dates are still text. */
export interface ReportInput {
	/** `yyyy-mm-dd`; default: today's local date. */
	from?: string;
	/** `yyyy-mm-dd`; default: `from`. Given, it makes the report a range report. */
	to?: string;
	/** Include each day's entries in a range report. A day report always has them. */
	entries?: boolean;
}

export type ReportEntry = {
	/** The entry's line number in the day file. */
	line: number;
	/** The entry's time as written, `HH:MM`, or `undefined` when it has none. */
	time: string | undefined;
	nutrients: Nutrients;
} & (
	| {
			kind: "reference";
			slug: string;
			version: number;
			item: ItemKind;
			/** The display name of the pinned version. */
			name: string;
			amount: number;
			/** The line's unit, or the item's default unit when the line gives none. */
			unit: string;
	  }
	| { kind: "inline"; description: string }
);

export interface ReportMeal {
	meal: string;
	/** Whether the meal is in the configuration. */
	configured: boolean;
	totals: Nutrients;
	/** Present in a day report, or when entries were requested. */
	entries?: ReportEntry[];
}

export interface ReportDay {
	date: string;
	/** The day file, which may not exist. */
	path: string;
	/** Whether the day has at least one entry. */
	logged: boolean;
	/** Configured meals in config order, then unknown ones in file order; meals without entries are left out. */
	meals: ReportMeal[];
	totals: Nutrients;
}

/** Fully calculated report data, unrounded. Every `Nutrients` has every catalog nutrient. */
export interface Report {
	kind: "day" | "range";
	from: string;
	to: string;
	/** Today's local date, from the clock. */
	today: string;
	/** The nutrient catalog, in order. */
	nutrients: readonly Nutrient[];
	/** One per date, in date order. */
	days: ReportDay[];
	loggedDays: number;
	/** The sum of every day's totals, today included. */
	totals: Nutrients;
	/** The dates the average covers: logged days other than today. */
	averageDays: string[];
	/** The average per day in `averageDays`, or `undefined` when there are none. */
	average: Nutrients | undefined;
	warnings: Problem[];
}

export interface ReportService {
	/**
	 * Calculates a day or range report. Throws one `NomnomError` carrying every
	 * problem found in every day when any day is invalid or can't be calculated.
	 */
	report(input: ReportInput): Promise<Report>;
}

type EntryContent = Extract<LineContent, { kind: "reference" | "inline" }>;

export function createReportService(deps: {
	fs: FileSystem;
	clock: Clock;
	paths: DataPaths;
	config: ConfigService;
	catalog: Catalog;
	nutrition: Nutrition;
}): ReportService {
	const { clock, catalog, nutrition } = deps;

	const checkDate = (date: string): void => {
		if (!isIsoDate(date)) {
			throw new NomnomError(
				`The date must be a real date as yyyy-mm-dd, got '${date}'`,
			);
		}
	};

	const calculate = async (
		content: EntryContent,
		line: number,
		config: Config,
	): Promise<ReportEntry> => {
		if (content.kind === "inline") {
			const nutrients = new Map<string, number>();
			for (const { id } of config.nutrients) {
				nutrients.set(
					id,
					content.values.find((value) => value.id === id)?.value ?? 0,
				);
			}
			return {
				line,
				time: content.time,
				kind: "inline",
				description: content.description,
				nutrients,
			};
		}
		const item = await catalog.resolve(content);
		const unit = content.unit ?? measureOf(item).defaultUnit;
		return {
			line,
			time: content.time,
			kind: "reference",
			slug: item.slug,
			version: item.record.version,
			item: item.kind,
			name: item.record.name,
			amount: content.amount,
			unit,
			nutrients: await nutrition.amountOf(item, content.amount, unit),
		};
	};

	return {
		async report(input) {
			const today = localDate(clock.now());
			const from = input.from ?? today;
			const to = input.to ?? from;
			checkDate(from);
			checkDate(to);
			if (to < from) {
				throw new NomnomError(
					`The end date ${to} is before the start date ${from}`,
				);
			}
			const kind = input.to === undefined ? "day" : "range";
			const withEntries = kind === "day" || input.entries === true;

			const config = await deps.config.load();
			const zero = () =>
				new Map(config.nutrients.map(({ id }): [string, number] => [id, 0]));

			const days: ReportDay[] = [];
			const problems: Problem[] = [];
			const invalidDays = new Set<string>();
			const warnings: Problem[] = [];

			// One day at a time, so the recipe cache fills once and results stay in order.
			for (const date of datesBetween(from, to)) {
				const { path, check } = await readDay(deps, config, date);
				warnings.push(...check.warnings);
				if (check.errors.length > 0) {
					problems.push(...check.errors);
					invalidDays.add(path);
				}

				const meals: ReportMeal[] = [];
				const dayTotals = zero();
				const addMeal = async (meal: string, lines: readonly DayLine[]) => {
					if (lines.length === 0) return;
					const entries: ReportEntry[] = [];
					const totals = zero();
					for (const { number, content } of lines) {
						if (!isEntry(content)) continue;
						let entry: ReportEntry;
						try {
							entry = await calculate(content, number, config);
						} catch (error) {
							if (!(error instanceof NomnomError)) throw error;
							problems.push(
								{ file: path, line: number, message: error.message },
								...error.problems,
							);
							invalidDays.add(path);
							continue;
						}
						entries.push(entry);
						addInto(totals, entry.nutrients);
					}
					addInto(dayTotals, totals);
					meals.push({
						meal,
						configured: config.meals.includes(meal),
						totals,
						...(withEntries ? { entries } : {}),
					});
				};

				// A day with validation errors is not calculated: its entries may not resolve.
				if (check.errors.length === 0) {
					for (const meal of config.meals) {
						await addMeal(meal, check.meals.get(meal) ?? []);
					}
					for (const [meal, lines] of check.meals) {
						if (!config.meals.includes(meal)) await addMeal(meal, lines);
					}
				}
				days.push({
					date,
					path,
					logged: meals.length > 0,
					meals,
					totals: dayTotals,
				});
			}

			if (problems.length > 0) {
				const [only] = invalidDays;
				const scope = kind === "day" ? "this day" : "this range";
				throw new NomnomError(
					invalidDays.size === 1 && only !== undefined
						? `${only} has errors; fix them to report on ${scope}`
						: `${invalidDays.size} day files have errors; fix them to report on ${scope}`,
					problems,
				);
			}

			const logged = days.filter((day) => day.logged);
			const totals = zero();
			for (const day of logged) addInto(totals, day.totals);
			const averaged = logged.filter((day) => day.date !== today);
			let average: Map<string, number> | undefined;
			if (averaged.length > 0) {
				average = zero();
				for (const day of averaged) addInto(average, day.totals);
				for (const [id, value] of average) {
					average.set(id, value / averaged.length);
				}
			}

			return {
				kind,
				from,
				to,
				today,
				nutrients: config.nutrients,
				days,
				loggedDays: logged.length,
				totals,
				averageDays: averaged.map((day) => day.date),
				average,
				warnings,
			};
		},
	};
}

function addInto(target: Map<string, number>, values: Nutrients): void {
	for (const [id, value] of values) {
		target.set(id, (target.get(id) ?? 0) + value);
	}
}
