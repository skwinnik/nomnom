import { MEAL_ID_PATTERN } from "../config/config";
import { NomnomError } from "../errors";
import { tryParseNumber } from "../shared/numbers";
import { type ItemRef, parseItemRef } from "../shared/references";
import { isTimeOfDay } from "../shared/time";
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
			/** Local wall-clock time `HH:MM` on the file's date, kept as written; absent when untimed. */
			readonly time?: string;
			readonly slug: string;
			readonly version: number;
			readonly amount: number;
			/** Absent when the line gives none: the item's default unit applies. */
			readonly unit?: string;
	  }
	| {
			readonly kind: "inline";
			/** Local wall-clock time `HH:MM` on the file's date, kept as written; absent when untimed. */
			readonly time?: string;
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
		const { time, rest } = splitTime(line);
		// splitTime rejects a header after a time, so only untimed lines get here.
		if (rest.startsWith("[")) return parseSection(stripComment(rest));
		const entry = rest.startsWith('"')
			? parseInline(rest)
			: parseReference(stripComment(rest));
		return time === undefined ? entry : { ...entry, time };
	} catch (error) {
		if (error instanceof NomnomError) {
			return { kind: "error", message: error.message };
		}
		throw error;
	}
}

/** A first word of digits and a colon, as in `08:15` or `8:15pm`. */
const TIME_LIKE = /^\d+:/;

/**
 * Splits the time prefix off a trimmed line. The first word decides: when it
 * isn't time-like, the line has no time and is returned unchanged. Slugs never
 * contain `:`, so no reference, not even one starting with digits such as
 * `7up@1`, can be taken for a time. A time-like word must be a valid time
 * followed by whitespace and an entry; anything else throws `NomnomError`.
 * The rest is checked before comments are removed, so `08:15  # x` is a time
 * without an entry.
 */
function splitTime(line: string): { readonly time?: string; rest: string } {
	const [word = ""] = line.split(/\s/, 1);
	if (!TIME_LIKE.test(word)) return { rest: line };
	if (!isTimeOfDay(word)) {
		if (isTimeOfDay(word.slice(0, 5)) && !/[\d:]/.test(word.charAt(5))) {
			throw new NomnomError(
				`the time '${word.slice(0, 5)}' must be followed by a space and an entry`,
			);
		}
		throw new NomnomError(
			`'${word}' is not a valid time: write it as HH:MM, from 00:00 to 23:59`,
		);
	}
	const rest = line.slice(word.length).trimStart();
	if (rest === "" || rest.startsWith("#")) {
		throw new NomnomError(`the time '${word}' needs an entry after it`);
	}
	if (rest.startsWith("[")) {
		throw new NomnomError(
			`the time '${word}' needs an entry after it, not a section header`,
		);
	}
	const [next = ""] = rest.split(/\s/, 1);
	if (TIME_LIKE.test(next)) {
		throw new NomnomError(
			`a line has at most one time, got '${next}' after '${word}'`,
		);
	}
	return { time: word, rest };
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

function parseReference(
	line: string,
): Extract<LineContent, { kind: "reference" }> {
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

type EntryText =
	| {
			readonly kind: "reference";
			/** As on a day-file line; absent when untimed. */
			readonly time?: string;
			readonly ref: ItemRef;
			readonly amount: number;
			readonly unit?: string;
	  }
	| Extract<LineContent, { kind: "inline" }>;

/**
 * Parses an entry given on the command line: a day-file entry line, with an
 * optional time prefix, whose reference may omit the version. Unlike a day
 * file, it rejects comments instead of removing them. Throws `NomnomError`.
 */
export function parseEntryText(text: string): EntryText {
	const trimmed = text.trim();
	if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("[")) {
		throw new NomnomError(
			`expected an entry such as 'apple 1' or '"ramen" kcal=800'`,
		);
	}
	// Before the comment check, so '08:15 # x' is a time without an entry.
	const { time, rest } = splitTime(trimmed);
	const entry = parseEntryRest(rest);
	return time === undefined ? entry : { ...entry, time };
}

function parseEntryRest(line: string): EntryText {
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
