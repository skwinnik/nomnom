import { MEAL_ID_PATTERN } from "../config/config";
import { NomnomError } from "../errors";
import { tryParseNumber } from "../shared/numbers";
import { type ItemRef, parseItemRef } from "../shared/references";
import { normaliseUnitName } from "../shared/units";

export interface InlineValue {
	readonly id: string;
	readonly value: number;
}

/** What a line of a day file holds. */
export type LineContent =
	| { readonly kind: "blank" }
	| { readonly kind: "comment" }
	| { readonly kind: "section"; readonly meal: string }
	| {
			readonly kind: "reference";
			readonly slug: string;
			readonly version: number;
			readonly amount: number;
			/** Absent when the line gives none: the item's default unit applies. */
			readonly unit?: string;
	  }
	| {
			readonly kind: "inline";
			readonly description: string;
			/** In the order written; checked against the catalog by validation. */
			readonly values: readonly InlineValue[];
	  }
	| { readonly kind: "error"; readonly message: string };

export interface DayLine {
	/** 1-based. */
	readonly number: number;
	/** The line exactly as read, without its line break. */
	readonly raw: string;
	readonly content: LineContent;
}

/** Splits a day file into lines, keeping each line's raw text next to what it holds. */
export function parseDay(text: string): DayLine[] {
	if (text === "") return [];
	const raws = text.split("\n");
	// A final line break ends the last line rather than starting another one.
	if (raws.at(-1) === "") raws.pop();
	return raws.map((raw, i) => ({
		number: i + 1,
		raw,
		content: parseLine(raw),
	}));
}

export function isEntry(
	content: LineContent,
): content is Extract<LineContent, { kind: "reference" | "inline" }> {
	return content.kind === "reference" || content.kind === "inline";
}

/** Parses one line. Problems become `error` lines rather than exceptions. */
export function parseLine(raw: string): LineContent {
	const line = raw.replace(/\r$/, "").trim();
	if (line === "") return { kind: "blank" };
	if (line.startsWith("#")) return { kind: "comment" };
	try {
		if (line.startsWith("[")) return parseSection(stripComment(line));
		if (line.startsWith('"')) return parseInline(line);
		return parseReference(stripComment(line));
	} catch (error) {
		if (error instanceof NomnomError) {
			return { kind: "error", message: error.message };
		}
		throw error;
	}
}

/** Removes a trailing comment: a `#` preceded by whitespace, up to the end of the line. */
function stripComment(text: string): string {
	const match = /\s#/.exec(text);
	return match ? text.slice(0, match.index).trimEnd() : text;
}

function parseSection(line: string): LineContent {
	const match = /^\[([^\]]*)\]$/.exec(line);
	if (!match) {
		throw new NomnomError(
			`expected a section header such as [breakfast], got '${line}'`,
		);
	}
	const meal = (match[1] ?? "").trim();
	if (!MEAL_ID_PATTERN.test(meal)) {
		throw new NomnomError(
			`invalid meal '${meal}': use lowercase letters, digits, '-' and '_'`,
		);
	}
	return { kind: "section", meal };
}

function parseReference(line: string): LineContent {
	const [ref = "", amountText, ...unitWords] = line.split(/\s+/);
	if (!ref.includes("@")) {
		throw new NomnomError(
			`'${ref}' needs a version: write it as ${ref}@<version>, as in apple@2`,
		);
	}
	const { slug, version } = parseItemRef(ref);
	if (version === undefined) throw new NomnomError(`'${ref}' needs a version`);
	const amount = parseAmount(ref, amountText);
	if (unitWords.length === 0)
		return { kind: "reference", slug, version, amount };
	return {
		kind: "reference",
		slug,
		version,
		amount,
		unit: normaliseUnitName(unitWords.join(" ")),
	};
}

function parseAmount(ref: string, amountText: string | undefined): number {
	if (amountText === undefined) {
		throw new NomnomError(`'${ref}' needs an amount, as in ${ref} 150 g`);
	}
	const amount = tryParseNumber(amountText);
	if (amount === undefined || !(amount > 0)) {
		throw new NomnomError(
			`the amount must be a positive number, got '${amountText}'`,
		);
	}
	return amount;
}

function parseInline(line: string): Extract<LineContent, { kind: "inline" }> {
	const close = line.indexOf('"', 1);
	if (close < 0) {
		throw new NomnomError("the description has no closing '\"'");
	}
	const description = line.slice(1, close).trim();
	if (description === "") throw new NomnomError("the description is empty");

	const rest = stripComment(line.slice(close + 1)).trim();
	const tokens = rest === "" ? [] : rest.split(/\s+/);
	if (tokens.length === 0) {
		throw new NomnomError(
			`"${description}" needs nutrient values, as in kcal=800`,
		);
	}
	const values = tokens.map((token): InlineValue => {
		const eq = token.indexOf("=");
		if (eq <= 0) {
			throw new NomnomError(
				`expected <nutrient>=<number>, got '${token}': an inline entry has nutrient values, not an amount and unit`,
			);
		}
		const id = token.slice(0, eq);
		const value = tryParseNumber(token.slice(eq + 1));
		if (value === undefined || value < 0) {
			throw new NomnomError(
				`'${id}' must be a non-negative number, got '${token.slice(eq + 1)}'`,
			);
		}
		return { id, value };
	});
	return { kind: "inline", description, values };
}

/**
 * Parses an entry given on the command line: a day-file entry line whose
 * reference may omit the version. Unlike a day file, it rejects comments
 * instead of removing them. Throws `NomnomError`.
 */
export function parseEntryText(text: string):
	| {
			readonly kind: "reference";
			readonly ref: ItemRef;
			readonly amount: number;
			readonly unit?: string;
	  }
	| Extract<LineContent, { kind: "inline" }> {
	const line = text.trim();
	if (line === "" || line.startsWith("#") || line.startsWith("[")) {
		throw new NomnomError(
			`expected an entry such as 'apple 1' or '"ramen" kcal=800'`,
		);
	}
	// Before the rest of the parsing, so a comment isn't reported as a bad unit.
	// An unclosed description is left to parseInline to report.
	const inline = line.startsWith('"');
	const close = inline ? line.indexOf('"', 1) : -1;
	if ((!inline || close > 0) && line.slice(close + 1).includes("#")) {
		throw new NomnomError(
			"entries can't contain comments ('#'); add comments to the day file by hand",
		);
	}
	if (inline) return parseInline(line);

	const [refText = "", amountText, ...unitWords] = line.split(/\s+/);
	const ref = parseItemRef(refText);
	const amount = parseAmount(refText, amountText);
	if (unitWords.length === 0) return { kind: "reference", ref, amount };
	return {
		kind: "reference",
		ref,
		amount,
		unit: normaliseUnitName(unitWords.join(" ")),
	};
}
