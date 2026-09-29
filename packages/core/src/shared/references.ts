import { NomnomError } from "../errors";
import { parseNumber } from "./numbers";
import { isSlug } from "./slug";
import { normaliseUnitName } from "./units";

/** A reference to a food or recipe, optionally pinned to a version. */
export interface ItemRef {
	slug: string;
	version?: number;
}

/** A reference with an amount and an optional unit, as in `carrot@1=2 medium carrot`. */
export interface AmountRef extends ItemRef {
	amount: number;
	unit?: string;
}

/** Parses `<slug>[@<version>]`. */
export function parseItemRef(text: string): ItemRef {
	const trimmed = text.trim();
	const at = trimmed.indexOf("@");
	const slug = at < 0 ? trimmed : trimmed.slice(0, at);
	if (!isSlug(slug)) {
		throw new NomnomError(
			`'${slug}' is not a valid food or recipe name: use letters, digits and '-'`,
		);
	}
	if (at < 0) return { slug };
	const versionText = trimmed.slice(at + 1);
	if (!/^[1-9]\d*$/.test(versionText)) {
		throw new NomnomError(
			`The version in '${trimmed}' must be a positive whole number`,
		);
	}
	return { slug, version: Number(versionText) };
}

/**
 * Parses `<slug>[@<version>]=<amount> [<unit>]`. The text is split at the first
 * `=`, since slugs never contain one; the unit is the rest after the amount.
 */
export function parseAmountRef(text: string): AmountRef {
	const eq = text.indexOf("=");
	if (eq < 0) {
		throw new NomnomError(
			`Expected <name>[@<version>]=<amount> [<unit>], got '${text}'`,
		);
	}
	const ref = parseItemRef(text.slice(0, eq));
	const rest = text.slice(eq + 1).trim();
	const space = rest.search(/\s/);
	const amountText = space < 0 ? rest : rest.slice(0, space);
	const unitText = space < 0 ? "" : rest.slice(space);
	const amount = parseNumber(amountText, `The amount in '${text}'`, "positive");
	return unitText.trim() === ""
		? { ...ref, amount }
		: { ...ref, amount, unit: normaliseUnitName(unitText) };
}
