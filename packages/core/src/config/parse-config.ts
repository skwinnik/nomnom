import { isMap, isSeq, LineCounter, type Node, parseDocument } from "yaml";
import { NomnomError, type Problem } from "../errors";
import { BUILT_IN_OPTION_NAMES } from "../shared/options";
import {
	type Config,
	MEAL_ID_PATTERN,
	NUTRIENT_ID_PATTERN,
	type Nutrient,
} from "./config";

/** Parses and validates the text of `config.yaml`, reporting every problem with its line. */
export function parseConfig(text: string, file: string): Config {
	const lineCounter = new LineCounter();
	const doc = parseDocument(text, { lineCounter, prettyErrors: false });
	const problems: Problem[] = [];
	const report = (node: Node | null | undefined, message: string) => {
		const offset = node?.range?.[0];
		problems.push(
			offset === undefined
				? { file, message }
				: { file, line: lineCounter.linePos(offset).line, message },
		);
	};

	for (const error of doc.errors) {
		problems.push({
			file,
			line: lineCounter.linePos(error.pos[0]).line,
			message: `invalid YAML: ${error.message}`,
		});
	}
	if (problems.length > 0) throw invalid(problems);

	const root = doc.contents;
	if (!isMap(root)) {
		report(root, "expected a map with 'nutrients' and 'meals'");
		throw invalid(problems);
	}

	const nutrients: Nutrient[] = [];
	const nutrientsNode = root.get("nutrients", true);
	if (!isSeq(nutrientsNode) || nutrientsNode.items.length === 0) {
		report(nutrientsNode ?? root, "'nutrients' must be a non-empty list");
	} else {
		const seen = new Set<string>();
		for (const item of nutrientsNode.items) {
			const nutrient = parseNutrient(item as Node, report);
			if (!nutrient) continue;
			if (seen.has(nutrient.id)) {
				report(item as Node, `duplicate nutrient id '${nutrient.id}'`);
				continue;
			}
			seen.add(nutrient.id);
			nutrients.push(nutrient);
		}
	}

	const meals: string[] = [];
	const mealsNode = root.get("meals", true);
	if (!isSeq(mealsNode) || mealsNode.items.length === 0) {
		report(mealsNode ?? root, "'meals' must be a non-empty list");
	} else {
		for (const item of mealsNode.items) {
			const meal = (item as Node).toJSON();
			if (typeof meal !== "string" || !MEAL_ID_PATTERN.test(meal)) {
				report(
					item as Node,
					`invalid meal id '${String(meal)}': use lowercase letters, digits, '-' and '_'`,
				);
			} else if (meals.includes(meal)) {
				report(item as Node, `duplicate meal '${meal}'`);
			} else {
				meals.push(meal);
			}
		}
	}

	if (problems.length > 0) throw invalid(problems);
	return { nutrients, meals };
}

function parseNutrient(
	node: Node,
	report: (node: Node | null | undefined, message: string) => void,
): Nutrient | undefined {
	if (!isMap(node)) {
		report(node, "a nutrient must be a map with 'id', 'name' and 'unit'");
		return undefined;
	}
	const value = (key: string) => node.get(key);
	const id = value("id");
	const name = value("name");
	const unit = value("unit");
	const required = value("required");
	let ok = true;

	if (typeof id !== "string" || !NUTRIENT_ID_PATTERN.test(id)) {
		report(
			node,
			`invalid nutrient id '${String(id)}': start with a lowercase letter and use only lowercase letters, digits and '_'`,
		);
		ok = false;
	} else if (BUILT_IN_OPTION_NAMES.includes(id)) {
		report(
			node,
			`nutrient id '${id}' is reserved: it is the name of a built-in option`,
		);
		ok = false;
	}
	for (const [key, text] of [
		["name", name],
		["unit", unit],
	] as const) {
		if (typeof text !== "string" || text.trim() === "") {
			report(node, `nutrient '${String(id)}': '${key}' must be non-empty text`);
			ok = false;
		}
	}
	if (required !== undefined && typeof required !== "boolean") {
		report(node, `nutrient '${String(id)}': 'required' must be true or false`);
		ok = false;
	}

	if (!ok) return undefined;
	return {
		id: id as string,
		name: (name as string).trim(),
		unit: (unit as string).trim(),
		required: required === true,
	};
}

function invalid(problems: Problem[]): NomnomError {
	return new NomnomError("config.yaml is invalid", problems);
}
