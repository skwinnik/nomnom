import { describe, expect, test } from "bun:test";
import { parseDay, parseLine } from "./parse";

describe("parseDay", () => {
	test("parses the example day, keeping raw text and line numbers", () => {
		const text = [
			"[breakfast]",
			"greek-yogurt-2-460123@1  150 g",
			"apple@2                  1 medium sized apple",
			"",
			"[dinner]",
			'"restaurant ramen"       kcal=800 protein=35',
			"",
		].join("\n");

		const lines = parseDay(text);

		expect(lines.map((line) => [line.number, line.raw, line.content])).toEqual([
			[1, "[breakfast]", { kind: "section", meal: "breakfast" }],
			[
				2,
				"greek-yogurt-2-460123@1  150 g",
				{
					kind: "reference",
					slug: "greek-yogurt-2-460123",
					version: 1,
					amount: 150,
					unit: "g",
				},
			],
			[
				3,
				"apple@2                  1 medium sized apple",
				{
					kind: "reference",
					slug: "apple",
					version: 2,
					amount: 1,
					unit: "medium sized apple",
				},
			],
			[4, "", { kind: "blank" }],
			[5, "[dinner]", { kind: "section", meal: "dinner" }],
			[
				6,
				'"restaurant ramen"       kcal=800 protein=35',
				{
					kind: "inline",
					description: "restaurant ramen",
					values: [
						{ id: "kcal", value: 800 },
						{ id: "protein", value: 35 },
					],
				},
			],
		]);
	});

	test("a final line break does not add a line, but blank lines before it count", () => {
		expect(parseDay("")).toEqual([]);
		expect(parseDay("[lunch]\n")).toHaveLength(1);
		expect(parseDay("[lunch]")).toHaveLength(1);
		expect(parseDay("[lunch]\n\n")).toHaveLength(2);
	});

	test("keeps a carriage return in the raw text but not in the content", () => {
		const [line] = parseDay("[lunch]\r\n");

		expect(line?.raw).toBe("[lunch]\r");
		expect(line?.content).toEqual({ kind: "section", meal: "lunch" });
	});
});

describe("parseLine", () => {
	test("ignores comments, including trailing ones", () => {
		expect(parseLine("# ate late today")).toEqual({ kind: "comment" });
		expect(parseLine("   # indented")).toEqual({ kind: "comment" });
		expect(parseLine("apple@2 1 small sized apple  # at work")).toEqual({
			kind: "reference",
			slug: "apple",
			version: 2,
			amount: 1,
			unit: "small sized apple",
		});
		expect(parseLine("[lunch] # at the office")).toEqual({
			kind: "section",
			meal: "lunch",
		});
	});

	test("keeps # inside the quoted description of an inline entry", () => {
		expect(parseLine('"combo #3 # big" kcal=900 # late')).toEqual({
			kind: "inline",
			description: "combo #3 # big",
			values: [{ id: "kcal", value: 900 }],
		});
	});

	test("a reference without a unit leaves it to the default unit", () => {
		expect(parseLine("rice@1 80")).toEqual({
			kind: "reference",
			slug: "rice",
			version: 1,
			amount: 80,
		});
	});

	test("normalises the unit like a unit name", () => {
		expect(parseLine("apple@2 1 medium \t sized  apple")).toMatchObject({
			unit: "medium sized apple",
		});
	});

	test("keeps the keys of an inline entry for validation, even unknown or repeated ones", () => {
		expect(parseLine('"x" kcal=1 kcal=2 weight=3')).toMatchObject({
			values: [
				{ id: "kcal", value: 1 },
				{ id: "kcal", value: 2 },
				{ id: "weight", value: 3 },
			],
		});
	});

	test.each([
		[
			"a reference without a version",
			"apple 1 medium sized apple",
			"needs a version",
		],
		["a reference without an amount", "apple@2", "needs an amount"],
		["a zero amount", "apple@2 0 g", "positive number"],
		["an amount that is not a number", "apple@2 one g", "positive number"],
		["a bad version", "apple@x 1", "positive whole number"],
		["a bad slug", "../apple@1 1", "not a valid food or recipe name"],
		["a unit containing #", "apple@2 1 can#2", "can't contain '#'"],
		["an unclosed section", "[lunch", "expected a section header"],
		["an invalid meal", "[Second Breakfast]", "invalid meal"],
		["an unclosed description", '"ramen kcal=800', "no closing"],
		["an empty description", '"" kcal=800', "description is empty"],
		["an inline entry without values", '"ramen"', "needs nutrient values"],
		[
			"an amount and unit instead of nutrients",
			'"ramen" 300 g',
			"expected <nutrient>=<number>",
		],
		["a negative inline value", '"ramen" kcal=-5', "non-negative"],
		[
			"a quote after the description",
			'"a" "b" kcal=1',
			"expected <nutrient>=<number>",
		],
	])("reports %s as an error line", (_name, line, message) => {
		const content = parseLine(line);

		expect(content.kind).toBe("error");
		expect(content.kind === "error" && content.message).toContain(message);
	});
});
