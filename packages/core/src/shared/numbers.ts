import { NomnomError } from "../errors";

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parses a decimal number, or returns `undefined` for anything else (including NaN and infinities). */
export function tryParseNumber(text: string): number | undefined {
	const trimmed = text.trim();
	if (!DECIMAL.test(trimmed)) return undefined;
	const value = Number(trimmed);
	if (!Number.isFinite(value)) return undefined;
	// Normalise -0.
	return value === 0 ? 0 : value;
}

export type NumberKind = "positive" | "non-negative";

/**
 * Parses a number given on the command line or in a file. `what` names the
 * value in the error, as in `--per` or `amount`.
 */
export function parseNumber(
	text: string,
	what: string,
	kind: NumberKind,
): number {
	const value = tryParseNumber(text);
	if (value === undefined) {
		throw new NomnomError(`${what} must be a number, got '${text}'`);
	}
	checkNumber(value, what, kind);
	return value;
}

export function checkNumber(
	value: number,
	what: string,
	kind: NumberKind,
): void {
	if (kind === "positive" && !(value > 0)) {
		throw new NomnomError(`${what} must be a positive number, got ${value}`);
	}
	if (kind === "non-negative" && !(value >= 0)) {
		throw new NomnomError(`${what} must not be negative, got ${value}`);
	}
}
