import { type Document, LineCounter, parseAllDocuments } from "yaml";
import { NomnomError, type Problem } from "../errors";
import { isSlug } from "../shared/slug";
import { isTimestampWithOffset } from "../shared/time";
import { normaliseUnitName, SERVING } from "../shared/units";
import type {
	FoodVersion,
	Ingredient,
	ItemKind,
	RecipeVersion,
} from "./records";

const FOOD_KEYS = [
	"version",
	"created",
	"name",
	"barcodes",
	"base_unit",
	"per",
	"nutrients",
	"units",
	"archived",
];
const RECIPE_KEYS = [
	"version",
	"created",
	"name",
	"servings",
	"base_unit",
	"yield",
	"units",
	"ingredients",
	"archived",
];
const INGREDIENT_KEYS = ["food", "recipe", "version", "amount", "unit"];

/** Parses every version of a food file, validating each document and the version sequence. */
export function parseFoodFile(text: string, file: string): FoodVersion[] {
	return parseVersionedFile(text, file, parseFood);
}

/** Parses every version of a recipe file, validating each document and the version sequence. */
export function parseRecipeFile(text: string, file: string): RecipeVersion[] {
	return parseVersionedFile(text, file, parseRecipe);
}

type Fields = Map<unknown, unknown>;

/** Collects the problems of one document. */
class Checker {
	readonly errors: string[] = [];

	fail(message: string): undefined {
		this.errors.push(message);
		return undefined;
	}

	/** Runs a parser that throws `NomnomError`, recording its message. */
	attempt<T>(parse: () => T): T | undefined {
		try {
			return parse();
		} catch (error) {
			if (error instanceof NomnomError) return this.fail(error.message);
			throw error;
		}
	}

	keys(fields: Fields, allowed: readonly string[], where: string): void {
		for (const key of fields.keys()) {
			if (typeof key !== "string" || !allowed.includes(key)) {
				this.fail(`unknown field '${String(key)}'${where}`);
			}
		}
	}

	text(value: unknown, what: string): string | undefined {
		if (typeof value !== "string" || value.trim() === "") {
			return this.fail(`'${what}' must be non-empty text`);
		}
		return value.trim();
	}

	number(
		value: unknown,
		what: string,
		kind: "positive" | "non-negative",
	): number | undefined {
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return this.fail(`'${what}' must be a number`);
		}
		if (kind === "positive" ? !(value > 0) : !(value >= 0)) {
			return this.fail(
				`'${what}' must be ${kind === "positive" ? "positive" : "non-negative"}`,
			);
		}
		return value;
	}

	unitName(value: unknown, what: string): string | undefined {
		if (typeof value !== "string") return this.fail(`'${what}' must be text`);
		return this.attempt(() => normaliseUnitName(value));
	}

	units(value: unknown, baseUnit: string | undefined): Map<string, number> {
		const units = new Map<string, number>();
		if (value === undefined) return units;
		if (!(value instanceof Map)) {
			this.fail("'units' must be a map of unit name to amount");
			return units;
		}
		for (const [key, amount] of value) {
			const name = this.unitName(String(key), "units");
			const factor = this.number(amount, `units: ${String(key)}`, "positive");
			if (name === undefined || factor === undefined) continue;
			if (name === baseUnit) {
				this.fail(`unit '${name}' is already the base unit`);
			} else if (units.has(name)) {
				this.fail(`unit '${name}' is defined more than once`);
			} else {
				units.set(name, factor);
			}
		}
		return units;
	}

	archived(value: unknown): boolean {
		if (value === undefined) return false;
		if (typeof value !== "boolean") {
			this.fail("'archived' must be true or false");
			return false;
		}
		return value;
	}

	created(value: unknown): string | undefined {
		if (typeof value !== "string" || !isTimestampWithOffset(value)) {
			return this.fail(
				"'created' must be an ISO 8601 timestamp with a UTC offset",
			);
		}
		return value;
	}
}

function parseVersionedFile<T extends { version: number }>(
	text: string,
	file: string,
	parse: (fields: Fields, check: Checker) => T | undefined,
): T[] {
	const lineCounter = new LineCounter();
	const docs = parseAllDocuments(text, {
		lineCounter,
		prettyErrors: false,
	});
	if (!Array.isArray(docs)) {
		throw new NomnomError(`${file} is not valid YAML`, [
			{ file, message: "not a YAML stream" },
		]);
	}

	const problems: Problem[] = [];
	const versions: T[] = [];
	docs.forEach((doc: Document, index) => {
		const number = index + 1;
		const start = doc.range?.[0] ?? 0;
		const line = lineCounter.linePos(start).line;
		const report = (message: string, at = line) =>
			problems.push({
				file,
				line: at,
				message: `document ${number}: ${message}`,
			});

		if (doc.errors.length > 0) {
			for (const error of doc.errors) {
				report(
					`invalid YAML: ${error.message}`,
					lineCounter.linePos(error.pos[0]).line,
				);
			}
			return;
		}
		const fields = doc.toJS({ mapAsMap: true });
		if (!(fields instanceof Map)) {
			report("expected a map of fields");
			return;
		}
		const check = new Checker();
		const parsed = parse(fields, check);
		if (parsed && parsed.version !== number) {
			check.fail(`expected version ${number}, found ${parsed.version}`);
		}
		for (const message of check.errors) report(message);
		if (parsed && check.errors.length === 0) versions.push(parsed);
	});

	if (docs.length === 0) {
		problems.push({ file, message: "the file has no versions" });
	}
	if (problems.length > 0) {
		throw new NomnomError(`${file} is invalid`, problems);
	}
	return versions;
}

function parseCommon(fields: Fields, check: Checker) {
	const version = fields.get("version");
	return {
		version:
			typeof version === "number" && Number.isInteger(version) && version > 0
				? version
				: check.fail("'version' must be a positive whole number"),
		created: check.created(fields.get("created")),
		name: check.text(fields.get("name"), "name"),
		archived: check.archived(fields.get("archived")),
	};
}

function parseFood(fields: Fields, check: Checker): FoodVersion | undefined {
	check.keys(fields, FOOD_KEYS, "");
	const common = parseCommon(fields, check);
	const baseUnit = check.unitName(fields.get("base_unit"), "base_unit");
	const per = check.number(fields.get("per"), "per", "positive");
	const barcodes = parseBarcodes(fields.get("barcodes"), check);
	const units = check.units(fields.get("units"), baseUnit);

	const nutrients = new Map<string, number>();
	const nutrientFields = fields.get("nutrients");
	if (!(nutrientFields instanceof Map)) {
		check.fail("'nutrients' must be a map of nutrient id to value");
	} else {
		for (const [id, value] of nutrientFields) {
			const amount = check.number(
				value,
				`nutrients: ${String(id)}`,
				"non-negative",
			);
			if (amount !== undefined) nutrients.set(String(id), amount);
		}
	}

	if (
		common.version === undefined ||
		common.created === undefined ||
		common.name === undefined ||
		baseUnit === undefined ||
		per === undefined
	) {
		return undefined;
	}
	return {
		version: common.version,
		created: common.created,
		name: common.name,
		barcodes,
		baseUnit,
		per,
		nutrients,
		units,
		archived: common.archived,
	};
}

function parseBarcodes(value: unknown, check: Checker): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		check.fail("'barcodes' must be a list");
		return [];
	}
	const barcodes: string[] = [];
	for (const barcode of value) {
		if (typeof barcode !== "string") {
			check.fail(
				`barcode ${String(barcode)} must be quoted text, as in "${String(barcode)}"`,
			);
		} else if (!/^\d+$/.test(barcode)) {
			check.fail(`barcode '${barcode}' must contain digits only`);
		} else if (barcodes.includes(barcode)) {
			check.fail(`barcode '${barcode}' is listed more than once`);
		} else {
			barcodes.push(barcode);
		}
	}
	return barcodes;
}

function parseRecipe(
	fields: Fields,
	check: Checker,
): RecipeVersion | undefined {
	check.keys(fields, RECIPE_KEYS, "");
	const common = parseCommon(fields, check);
	const servings = check.number(fields.get("servings"), "servings", "positive");

	const baseUnitField = fields.get("base_unit");
	const yieldField = fields.get("yield");
	let recipeYield: RecipeVersion["yield"];
	if ((baseUnitField === undefined) !== (yieldField === undefined)) {
		check.fail("'base_unit' and 'yield' must be given together");
	} else if (baseUnitField !== undefined) {
		const baseUnit = check.unitName(baseUnitField, "base_unit");
		const amount = check.number(yieldField, "yield", "positive");
		if (baseUnit === SERVING) {
			check.fail(`'${SERVING}' is reserved and can't be the base unit`);
		} else if (baseUnit !== undefined && amount !== undefined) {
			recipeYield = { baseUnit, amount };
		}
	}

	const unitsField = fields.get("units");
	if (unitsField !== undefined && yieldField === undefined) {
		check.fail("'units' need a 'yield'");
	}
	const units = check.units(unitsField, recipeYield?.baseUnit);
	if (units.has(SERVING)) {
		check.fail(`'${SERVING}' is reserved and can't be defined as a unit`);
	}

	const ingredients: Ingredient[] = [];
	const ingredientsField = fields.get("ingredients");
	if (!Array.isArray(ingredientsField) || ingredientsField.length === 0) {
		check.fail("'ingredients' must be a non-empty list");
	} else {
		ingredientsField.forEach((item, index) => {
			const ingredient = parseIngredient(item, index + 1, check);
			if (ingredient) ingredients.push(ingredient);
		});
	}

	if (
		common.version === undefined ||
		common.created === undefined ||
		common.name === undefined ||
		servings === undefined
	) {
		return undefined;
	}
	return {
		version: common.version,
		created: common.created,
		name: common.name,
		servings,
		...(recipeYield ? { yield: recipeYield } : {}),
		units,
		ingredients,
		archived: common.archived,
	};
}

function parseIngredient(
	item: unknown,
	number: number,
	check: Checker,
): Ingredient | undefined {
	const where = ` in ingredient ${number}`;
	if (!(item instanceof Map)) {
		return check.fail(`ingredient ${number} must be a map`);
	}
	check.keys(item, INGREDIENT_KEYS, where);
	const kinds = (["food", "recipe"] as const).filter((kind) => item.has(kind));
	const [kind] = kinds;
	if (kind === undefined || kinds.length > 1) {
		return check.fail(
			`ingredient ${number} must have exactly one of 'food' and 'recipe'`,
		);
	}
	const slug = item.get(kind);
	if (typeof slug !== "string" || !isSlug(slug)) {
		return check.fail(
			`ingredient ${number}: '${String(slug)}' is not a valid ${kind} name`,
		);
	}
	const version = item.get("version");
	if (
		typeof version !== "number" ||
		!Number.isInteger(version) ||
		version < 1
	) {
		return check.fail(`'version' must be a positive whole number${where}`);
	}
	const amount = check.number(item.get("amount"), `amount${where}`, "positive");
	const unit = check.unitName(item.get("unit"), `unit${where}`);
	if (amount === undefined || unit === undefined) return undefined;
	return { kind: kind satisfies ItemKind, slug, version, amount, unit };
}
