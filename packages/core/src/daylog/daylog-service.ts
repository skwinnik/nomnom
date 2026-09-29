import type { Catalog } from "../catalog/catalog";
import { resolveReference } from "../catalog/reference";
import type { Clock } from "../clock/clock";
import type { Config } from "../config/config";
import type { ConfigService } from "../config/config-service";
import type { DataPaths } from "../data-dir/paths";
import { NomnomError, type Problem } from "../errors";
import type { FileSystem } from "../fs/file-system";
import { parseNumber } from "../shared/numbers";
import { parseNutrientInput } from "../shared/nutrient-input";
import { type ItemRef, parseItemRef } from "../shared/references";
import { isIsoDate, localDate } from "../shared/time";
import { normaliseUnitName } from "../shared/units";
import { insertEntries } from "./insert";
import { isEntry, parseEntryText, parseLine } from "./parse";
import { readDay } from "./read-day";
import { checkEntry } from "./validate";

/**
 * What to log, as typed on the command line: every value is still text. Either
 * one entry (a reference or an inline entry) or `entries`, not both.
 */
export interface LogInput {
	meal: string;
	/** `yyyy-mm-dd`; default: today's local date. */
	date?: string;
	/** A reference entry: `<slug>[@<version>]` with an amount and optional unit. */
	ref?: string;
	amount?: string;
	unit?: string;
	/** An inline entry: its description, with `nutrients`. */
	inline?: string;
	/** Values by nutrient id, for an inline entry. */
	nutrients?: Readonly<Record<string, string | undefined>>;
	/** Entries written as day-file lines whose version may be omitted, as typed. */
	entries?: readonly string[];
}

export interface Logged {
	/** The day file written. */
	path: string;
	date: string;
	/** The lines added, in order. */
	lines: string[];
	/** Problems in the existing file that did not block logging. */
	warnings: Problem[];
}

export interface DayLogService {
	/**
	 * Adds one or more entries to a day file, keeping every existing line. Adds
	 * all of them or none: refuses to write when any entry is invalid, reporting
	 * every invalid one, or when the existing file has errors.
	 */
	log(input: LogInput): Promise<Logged>;
}

export function createDayLogService(deps: {
	fs: FileSystem;
	clock: Clock;
	paths: DataPaths;
	config: ConfigService;
	catalog: Catalog;
}): DayLogService {
	const { fs, clock, paths, catalog } = deps;

	/**
	 * Writes a new reference in the standard form, pinning the latest version
	 * when none is given. The checks are those of `resolveReference`.
	 */
	const pinReference = async (
		entry: { ref: ItemRef; amount: number; unit?: string },
		config: Config,
	): Promise<string> => {
		const { item, unit } = await resolveReference(
			{ catalog, config },
			entry.ref,
			{ unit: entry.unit, newReference: true },
		);
		return `${item.slug}@${item.record.version} ${entry.amount} ${unit}`;
	};

	const referenceLine = async (
		input: LogInput,
		config: Config,
	): Promise<string> => {
		if (input.ref === undefined || input.amount === undefined) {
			throw new NomnomError(
				"Give a food or recipe and an amount, as in 'nomnom log lunch rice 80 g', or an --inline entry",
			);
		}
		if (Object.values(input.nutrients ?? {}).some((v) => v !== undefined)) {
			throw new NomnomError("Nutrient values are only given with --inline");
		}
		const ref = parseItemRef(input.ref);
		const amount = parseNumber(input.amount, "The amount", "positive");
		return pinReference(
			input.unit === undefined || input.unit.trim() === ""
				? { ref, amount }
				: { ref, amount, unit: normaliseUnitName(input.unit) },
			config,
		);
	};

	const inlineLine = (input: LogInput, config: Config): string => {
		if (input.ref !== undefined || input.amount !== undefined || input.unit) {
			throw new NomnomError(
				"Give either a food or recipe with an amount, or --inline, not both",
			);
		}
		const description = (input.inline ?? "").trim();
		if (description === "") {
			throw new NomnomError("The --inline description must not be empty");
		}
		if (/["\r\n]/.test(description)) {
			throw new NomnomError(
				"The --inline description can't contain '\"' or line breaks",
			);
		}
		const values = parseNutrientInput(input.nutrients ?? {}, config.nutrients);
		if (values.size === 0) {
			throw new NomnomError(
				"An inline entry needs at least one nutrient value, as in --kcal 800",
			);
		}
		return formatInline(description, values);
	};

	/** One entry given as the positional form or --inline. Throws on its first problem. */
	const singleLine = async (
		input: LogInput,
		config: Config,
	): Promise<string> => {
		const line =
			input.inline === undefined
				? await referenceLine(input, config)
				: inlineLine(input, config);
		// The new line must pass the same checks as a hand-written one.
		const content = parseLine(line);
		if (!isEntry(content)) {
			throw new NomnomError(
				`Can't log '${line}': ${content.kind === "error" ? content.message : "not an entry"}`,
			);
		}
		const problems = await checkEntry(content, { config, catalog });
		if (problems.length > 0) {
			throw new NomnomError(`Can't log '${line}'`, problems);
		}
		return line;
	};

	/**
	 * Builds an --entry value into its line in the standard form and checks the
	 * line by the rules of a hand-written one. Problems in the entry itself have
	 * an empty `file`.
	 */
	const entryLine = async (
		text: string,
		config: Config,
	): Promise<{ line: string } | { problems: Problem[] }> => {
		let line: string;
		try {
			const entry = parseEntryText(text);
			if (entry.kind === "reference") {
				line = await pinReference(entry, config);
			} else {
				// Before writing the line, which keeps only known nutrients.
				const problems = await checkEntry(entry, { config, catalog });
				if (problems.length > 0) return { problems };
				const values = new Map(entry.values.map((v) => [v.id, v.value]));
				line = formatInline(
					entry.description,
					config.nutrients.flatMap(({ id }) => {
						const value = values.get(id);
						return value === undefined ? [] : [[id, value] as const];
					}),
				);
			}
		} catch (error) {
			if (!(error instanceof NomnomError)) throw error;
			return {
				problems: [{ file: "", message: error.message }, ...error.problems],
			};
		}
		const content = parseLine(line);
		if (!isEntry(content)) {
			const message =
				content.kind === "error" ? content.message : "not an entry";
			return { problems: [{ file: "", message }] };
		}
		const problems = await checkEntry(content, { config, catalog });
		return problems.length > 0 ? { problems } : { line };
	};

	/** Builds every --entry value, or throws with the problems of every invalid one. */
	const entryLines = async (
		entries: readonly string[],
		config: Config,
	): Promise<string[]> => {
		const lines: string[] = [];
		const problems: Problem[] = [];
		let invalid = 0;
		for (const [i, raw] of entries.entries()) {
			const built = await entryLine(raw, config);
			if ("line" in built) {
				lines.push(built.line);
				continue;
			}
			invalid++;
			const label = `entry ${i + 1} '${raw.trim()}'`;
			for (const problem of built.problems) {
				problems.push(
					problem.file === ""
						? { ...problem, message: `${label}: ${problem.message}` }
						: problem,
				);
			}
		}
		if (invalid > 0) {
			throw new NomnomError(
				entries.length === 1
					? "Can't log the entry"
					: `Can't log ${invalid} of ${entries.length} entries`,
				problems,
			);
		}
		return lines;
	};

	return {
		async log(input) {
			const config = await deps.config.load();
			if (!config.meals.includes(input.meal)) {
				throw new NomnomError(
					`'${input.meal}' is not a configured meal; the meals are ${config.meals.join(", ")}`,
				);
			}
			const date = input.date ?? localDate(clock.now());
			if (!isIsoDate(date)) {
				throw new NomnomError(
					`The date must be a real date as yyyy-mm-dd, got '${date}'`,
				);
			}

			const entries = input.entries ?? [];
			if (entries.length > 0 && hasSingleEntry(input)) {
				throw new NomnomError(
					"Give --entry values, or one entry as a food or recipe with an amount or with --inline, not both",
				);
			}
			const added =
				entries.length > 0
					? await entryLines(entries, config)
					: [await singleLine(input, config)];

			const { path, lines, check } = await readDay(
				{ fs, paths, catalog },
				config,
				date,
			);
			if (check.errors.length > 0) {
				throw new NomnomError(
					`${path} has errors; fix them before logging to this day`,
					check.errors,
				);
			}

			await fs.replaceAtomic(
				path,
				insertEntries(lines, input.meal, added, config.meals),
			);
			return { path, date, lines: added, warnings: check.warnings };
		},
	};
}

/** Whether any part of the positional form or --inline is given. */
function hasSingleEntry(input: LogInput): boolean {
	return (
		input.ref !== undefined ||
		input.amount !== undefined ||
		input.unit !== undefined ||
		input.inline !== undefined ||
		Object.values(input.nutrients ?? {}).some((v) => v !== undefined)
	);
}

/** An inline entry line in the standard form. */
function formatInline(
	description: string,
	values: Iterable<readonly [string, number]>,
): string {
	const pairs = [...values].map(([id, value]) => `${id}=${value}`);
	return `"${description}" ${pairs.join(" ")}`;
}
