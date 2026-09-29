import { NomnomError } from "../errors";
import { parseNumber } from "./numbers";

/** The unit every recipe allows and no recipe may define. */
export const SERVING = "serving";

/**
 * Normalises a unit name: trims it and collapses whitespace runs to one space.
 * Rejects an empty name and a name containing `#`, which starts comments in
 * day files.
 */
export function normaliseUnitName(raw: string): string {
	const name = raw.trim().replace(/\s+/g, " ");
	if (name === "") throw new NomnomError("A unit name must not be empty");
	if (name.includes("#")) {
		throw new NomnomError(`Unit names can't contain '#': '${name}'`);
	}
	return name;
}

export interface UnitDefinition {
	name: string;
	/** Positive amount of base units. */
	amount: number;
}

/** Parses `<name>=<amount>`, splitting at the last `=` so names may contain `=`. */
export function parseUnitDefinition(text: string): UnitDefinition {
	const at = text.lastIndexOf("=");
	if (at < 0) {
		throw new NomnomError(`Expected <name>=<amount> for a unit, got '${text}'`);
	}
	return {
		name: normaliseUnitName(text.slice(0, at)),
		amount: parseNumber(
			text.slice(at + 1),
			`The amount of unit '${text.slice(0, at).trim()}'`,
			"positive",
		),
	};
}

/** Parses `<name>=<amount>` unit definitions, rejecting duplicates and the base unit. */
export function parseUnits(
	definitions: readonly string[],
	baseUnit: string | undefined,
): Map<string, number> {
	const units = new Map<string, number>();
	for (const definition of definitions) {
		const { name, amount } = parseUnitDefinition(definition);
		if (name === baseUnit) {
			throw new NomnomError(`'${name}' is already the base unit`);
		}
		if (units.has(name)) {
			throw new NomnomError(`Unit '${name}' is defined more than once`);
		}
		units.set(name, amount);
	}
	return units;
}
