import type { Catalog } from "../catalog/catalog";
import { resolveReference, TargetError } from "../catalog/reference";
import type { Config } from "../config/config";
import { NomnomError, type Problem } from "../errors";
import { type DayLine, isEntry, type LineContent } from "./parse";

export interface DayCheck {
	/** Problems that make the day invalid, in line order. */
	errors: Problem[];
	/** Problems that don't, such as a section for an unknown meal. */
	warnings: Problem[];
	/** Entry lines by meal, with duplicate sections merged, in file order of first appearance. */
	meals: Map<string, DayLine[]>;
}

export interface ValidationContext {
	config: Config;
	catalog: Catalog;
	/** The day file, for locating problems. */
	file: string;
	/**
	 * Leave out problems of the referenced items (`TargetError`), such as an
	 * invalid food file or an unusable food version, for a caller that reports
	 * them at the items themselves.
	 */
	omitTargetProblems?: boolean;
}

/** Checks a parsed day against the config and the catalog, collecting every problem. */
export async function validateDay(
	lines: readonly DayLine[],
	context: ValidationContext,
): Promise<DayCheck> {
	const { config, file } = context;
	const errors: Problem[] = [];
	const warnings: Problem[] = [];
	const meals = new Map<string, DayLine[]>();
	let meal: string | undefined;

	for (const line of lines) {
		const { content } = line;
		if (content.kind === "section") {
			meal = content.meal;
			if (!config.meals.includes(meal)) {
				warnings.push({
					file,
					line: line.number,
					message: `'${meal}' is not a meal in config.yaml; it is kept after the configured meals`,
				});
			}
			if (!meals.has(meal)) meals.set(meal, []);
			continue;
		}
		if (content.kind === "error") {
			errors.push({ file, line: line.number, message: content.message });
			continue;
		}
		if (!isEntry(content)) continue;
		if (meal === undefined) {
			errors.push({
				file,
				line: line.number,
				message:
					"this entry comes before any section header such as [breakfast]",
			});
			continue;
		}
		meals.get(meal)?.push(line);
		for (const problem of await checkEntry(content, context)) {
			errors.push(
				problem.file === file || problem.file === ""
					? { file, line: line.number, message: problem.message }
					: problem,
			);
		}
	}
	return { errors, warnings, meals };
}

/**
 * Checks one entry by the rules of a hand-written line. Problems in the entry
 * itself have an empty `file`; problems found in other files keep theirs.
 */
export async function checkEntry(
	content: Extract<LineContent, { kind: "reference" | "inline" }>,
	context: Omit<ValidationContext, "file">,
): Promise<Problem[]> {
	if (content.kind === "inline") return checkInline(content, context.config);
	try {
		await resolveReference(context, content, { unit: content.unit });
		return [];
	} catch (error) {
		if (!(error instanceof NomnomError)) throw error;
		if (error instanceof TargetError && context.omitTargetProblems) return [];
		return [{ file: "", message: error.message }, ...error.problems];
	}
}

function checkInline(
	content: Extract<LineContent, { kind: "inline" }>,
	config: Config,
): Problem[] {
	const problems: Problem[] = [];
	const seen = new Set<string>();
	for (const { id } of content.values) {
		if (!config.nutrients.some((nutrient) => nutrient.id === id)) {
			problems.push({
				file: "",
				message: `'${id}' is not a nutrient in config.yaml`,
			});
		} else if (seen.has(id)) {
			problems.push({ file: "", message: `'${id}' is given more than once` });
		}
		seen.add(id);
	}
	for (const nutrient of config.nutrients) {
		if (nutrient.required && !seen.has(nutrient.id)) {
			problems.push({
				file: "",
				message: `the required nutrient '${nutrient.id}' is missing`,
			});
		}
	}
	return problems;
}
