import type { Catalog } from "../catalog/catalog";
import { measureOf } from "../catalog/units";
import type { Clock } from "../clock/clock";
import type { Config } from "../config/config";
import type { ConfigService } from "../config/config-service";
import type { DataPaths } from "../data-dir/paths";
import { NomnomError, type Problem } from "../errors";
import type { FileSystem } from "../fs/file-system";
import { unitFactor } from "../nutrition/nutrition";
import { parseNumber } from "../shared/numbers";
import { parseNutrientInput } from "../shared/nutrient-input";
import { parseItemRef } from "../shared/references";
import { isIsoDate, localDate } from "../shared/time";
import { normaliseUnitName } from "../shared/units";
import { insertEntry } from "./insert";
import { isEntry, parseLine } from "./parse";
import { readDay } from "./read-day";
import { checkEntry } from "./validate";

/** One entry as typed on the command line: every value is still text. */
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
}

export interface Logged {
	/** The day file written. */
	path: string;
	date: string;
	/** The line added. */
	line: string;
	/** Problems in the existing file that did not block logging. */
	warnings: Problem[];
}

export interface DayLogService {
	/**
	 * Adds one entry to a day file, keeping every existing line. Refuses to write
	 * when the existing file has errors.
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

	const referenceLine = async (input: LogInput): Promise<string> => {
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
		const item = await catalog.resolve(ref, { newReference: true });
		const unit =
			input.unit === undefined || input.unit.trim() === ""
				? measureOf(item).defaultUnit
				: normaliseUnitName(input.unit);
		unitFactor(item, unit);
		return `${item.slug}@${item.record.version} ${amount} ${unit}`;
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
		const pairs = [...values].map(([id, value]) => `${id}=${value}`);
		return `"${description}" ${pairs.join(" ")}`;
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

			const line =
				input.inline === undefined
					? await referenceLine(input)
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
				insertEntry(lines, input.meal, line, config.meals),
			);
			return { path, date, line, warnings: check.warnings };
		},
	};
}
