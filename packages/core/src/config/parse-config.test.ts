import { describe, expect, test } from "bun:test";
import { NomnomError, type Problem } from "../errors";
import { defaultConfig } from "./__mocks__/config-service";
import { DEFAULT_CONFIG_TEXT } from "./config";
import { parseConfig } from "./parse-config";

const file = "/data/config.yaml";

function problemsOf(text: string): Problem[] {
	try {
		parseConfig(text, file);
	} catch (error) {
		expect(error).toBeInstanceOf(NomnomError);
		expect((error as NomnomError).message).toContain("config.yaml");
		return [...(error as NomnomError).problems];
	}
	throw new Error("expected the config to be rejected");
}

function withNutrients(...lines: string[]): string {
	return ["nutrients:", ...lines, "meals: [breakfast]", ""].join("\n");
}

const kcal = "  - { id: kcal, name: Energy, unit: kcal, required: true }";

describe("parseConfig", () => {
	test("parses the default config", () => {
		expect(parseConfig(DEFAULT_CONFIG_TEXT, file)).toEqual(defaultConfig);
	});

	test("accepts a custom nutrient", () => {
		const config = parseConfig(
			withNutrients(kcal, "  - { id: vitamin_c, name: Vitamin C, unit: mg }"),
			file,
		);

		expect(config.nutrients.map((n) => n.id)).toEqual(["kcal", "vitamin_c"]);
	});

	test("rejects a nutrient id that does not match the pattern", () => {
		const problems = problemsOf(
			withNutrients(kcal, "  - { id: Vitamin C, name: Vitamin C, unit: mg }"),
		);

		expect(problems).toEqual([
			{
				file,
				line: 3,
				message: expect.stringContaining("invalid nutrient id 'Vitamin C'"),
			},
		]);
	});

	test("rejects duplicate nutrient ids", () => {
		const problems = problemsOf(
			withNutrients(kcal, "  - { id: kcal, name: Energy again, unit: kcal }"),
		);

		expect(problems).toEqual([
			{ file, line: 3, message: "duplicate nutrient id 'kcal'" },
		]);
	});

	test("rejects a required flag that is not a boolean", () => {
		const problems = problemsOf(
			withNutrients(
				"  - { id: kcal, name: Energy, unit: kcal, required: yes }",
			),
		);

		expect(problems[0]?.message).toContain("'required' must be true or false");
	});

	test("rejects a nutrient id that clashes with a built-in option", () => {
		const problems = problemsOf(
			withNutrients(kcal, "  - { id: name, name: Name, unit: g }"),
		);

		expect(problems[0]?.message).toContain("'name' is reserved");
	});

	test("rejects a nutrient without a name or unit", () => {
		const problems = problemsOf(withNutrients("  - { id: kcal }"));

		expect(problems.map((p) => p.message)).toEqual([
			"nutrient 'kcal': 'name' must be non-empty text",
			"nutrient 'kcal': 'unit' must be non-empty text",
		]);
	});

	test("rejects a meal id that does not match the pattern", () => {
		const problems = problemsOf(
			["nutrients:", kcal, "meals: [breakfast, Second Breakfast]", ""].join(
				"\n",
			),
		);

		expect(problems).toEqual([
			{
				file,
				line: 3,
				message: expect.stringContaining("invalid meal id 'Second Breakfast'"),
			},
		]);
	});

	test("rejects duplicate meals", () => {
		const problems = problemsOf(
			["nutrients:", kcal, "meals:", "  - lunch", "  - lunch", ""].join("\n"),
		);

		expect(problems).toEqual([
			{ file, line: 5, message: "duplicate meal 'lunch'" },
		]);
	});

	test("rejects missing or empty lists", () => {
		expect(problemsOf("meals: [lunch]\n")[0]?.message).toBe(
			"'nutrients' must be a non-empty list",
		);
		expect(
			problemsOf(["nutrients:", kcal, "meals: []", ""].join("\n"))[0]?.message,
		).toBe("'meals' must be a non-empty list");
		expect(problemsOf("")[0]?.message).toContain("expected a map");
	});

	test("rejects malformed YAML with its line", () => {
		const problems = problemsOf("nutrients:\n  - id: kcal\n meals: [\n");

		expect(problems[0]?.file).toBe(file);
		expect(problems[0]?.line).toBeNumber();
		expect(problems[0]?.message).toStartWith("invalid YAML:");
	});

	test("reports every problem at once", () => {
		const problems = problemsOf(
			[
				"nutrients:",
				"  - { id: Kcal, name: Energy, unit: kcal }",
				"  - { id: date, name: Date, unit: d }",
				"meals: [lunch, lunch]",
				"",
			].join("\n"),
		);

		expect(problems.map((p) => p.line)).toEqual([2, 3, 4]);
	});
});
