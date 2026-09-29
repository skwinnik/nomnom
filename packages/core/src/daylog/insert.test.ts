import { describe, expect, test } from "bun:test";
import { insertEntries } from "./insert";
import { parseDay } from "./parse";

const meals = ["breakfast", "lunch", "dinner", "snack"];

function insert(text: string, meal: string, entry = "apple@2 1 g"): string {
	return insertEntries(parseDay(text), meal, [entry], meals);
}

/** Inserts `entries` one call at a time. */
function insertEach(text: string, meal: string, entries: string[]): string {
	return entries.reduce((result, entry) => insert(result, meal, entry), text);
}

/** Every original line appears in the result unchanged and in order, and only `added` lines are new. */
function expectPreserved(original: string, result: string, added: string[]) {
	const before = original.split("\n");
	if (before.at(-1) === "") before.pop();
	const after = result.split("\n");
	after.pop();
	const remaining = [...after];
	for (const line of added) remaining.splice(remaining.indexOf(line), 1);
	expect(remaining).toEqual(before);
}

describe("insertEntries", () => {
	test("appends to an existing section after its last entry, keeping every other line", () => {
		const original = [
			"# my day",
			"[breakfast]",
			"greek-yogurt-2-460123@1  150 g   # with honey",
			"apple@2                  1 medium sized apple",
			"",
			"[lunch]",
			"rice@1 80",
			"",
		].join("\n");

		const result = insert(original, "breakfast", "banana@1 1 g");

		expect(result).toBe(
			[
				"# my day",
				"[breakfast]",
				"greek-yogurt-2-460123@1  150 g   # with honey",
				"apple@2                  1 medium sized apple",
				"banana@1 1 g",
				"",
				"[lunch]",
				"rice@1 80",
				"",
			].join("\n"),
		);
		expectPreserved(original, result, ["banana@1 1 g"]);
	});

	test("goes after a trailing comment of the section", () => {
		const result = insert("[dinner]\nrice@1 80\n\n# too much\n", "dinner");

		expect(result).toBe("[dinner]\nrice@1 80\n\n# too much\napple@2 1 g\n");
	});

	test("goes right after the header of a section without entries", () => {
		expect(insert("[lunch]\n\n[dinner]\nrice@1 80\n", "lunch")).toBe(
			"[lunch]\napple@2 1 g\n\n[dinner]\nrice@1 80\n",
		);
	});

	test("uses the meal's last section when there are several", () => {
		expect(
			insert("[lunch]\na@1 1\n[dinner]\nb@1 1\n[lunch]\nc@1 1\n\n", "lunch"),
		).toBe("[lunch]\na@1 1\n[dinner]\nb@1 1\n[lunch]\nc@1 1\napple@2 1 g\n\n");
	});

	test("inserts a new section between earlier and later meals, with blank lines", () => {
		const original = "[breakfast]\na@1 1\n\n[dinner]\nb@1 1\n";

		const result = insert(original, "lunch");

		expect(result).toBe(
			"[breakfast]\na@1 1\n\n[lunch]\napple@2 1 g\n\n[dinner]\nb@1 1\n",
		);
		expectPreserved(original, result, ["[lunch]", "apple@2 1 g", ""]);
	});

	test("adds a blank line before the new section when there is none", () => {
		expect(insert("[breakfast]\na@1 1\n[dinner]\nb@1 1\n", "lunch")).toBe(
			"[breakfast]\na@1 1\n\n[lunch]\napple@2 1 g\n\n[dinner]\nb@1 1\n",
		);
	});

	test("inserts a new section at the top when every section is later", () => {
		expect(insert("[dinner]\nb@1 1\n", "breakfast")).toBe(
			"[breakfast]\napple@2 1 g\n\n[dinner]\nb@1 1\n",
		);
	});

	test("puts configured meals before unknown ones", () => {
		expect(insert("[lunch]\na@1 1\n\n[brunch]\nb@1 1\n", "snack")).toBe(
			"[lunch]\na@1 1\n\n[snack]\napple@2 1 g\n\n[brunch]\nb@1 1\n",
		);
	});

	test("appends a new section at the end when no section is later", () => {
		expect(insert("[breakfast]\na@1 1\n", "dinner")).toBe(
			"[breakfast]\na@1 1\n\n[dinner]\napple@2 1 g\n",
		);
		expect(insert("[breakfast]\na@1 1\n\n", "dinner")).toBe(
			"[breakfast]\na@1 1\n\n[dinner]\napple@2 1 g\n",
		);
	});

	test("creates the header and entry for a new file", () => {
		expect(insert("", "snack")).toBe("[snack]\napple@2 1 g\n");
	});

	test("adds a missing final line break without changing the last line", () => {
		const original = "[lunch]\na@1 1   # no newline";

		const result = insert(original, "dinner");

		expect(result).toBe(
			"[lunch]\na@1 1   # no newline\n\n[dinner]\napple@2 1 g\n",
		);
	});

	test("keeps odd formatting, carriage returns and alignment byte for byte", () => {
		const original = [
			"   [breakfast]   # spaced",
			"\tapple@2\t\t1   medium   sized apple\r",
			'  "odd  # name"   kcal=1   ',
			"#",
			"[dinner]",
			"",
		].join("\n");

		const result = insert(original, "breakfast");

		expectPreserved(original, result, ["apple@2 1 g"]);
		expect(result.split("\n")[4]).toBe("apple@2 1 g");
	});

	test("inserts several entries after a trailing comment of the section, in order", () => {
		const original =
			"[breakfast]\neggs@2 2\n# before the run\n\n[lunch]\nrice@1 80\n";

		const result = insertEntries(
			parseDay(original),
			"breakfast",
			["oats@2 60 g", "milk@1 200 ml"],
			meals,
		);

		expect(result).toBe(
			"[breakfast]\neggs@2 2\n# before the run\noats@2 60 g\nmilk@1 200 ml\n\n[lunch]\nrice@1 80\n",
		);
		expectPreserved(original, result, ["oats@2 60 g", "milk@1 200 ml"]);
	});

	test("inserts a new section with several entries between earlier and later meals", () => {
		const original = "[breakfast]\na@1 1\n\n[dinner]\nb@1 1\n";

		const result = insertEntries(
			parseDay(original),
			"lunch",
			["x@1 1", "y@1 2", "z@1 3"],
			meals,
		);

		expect(result).toBe(
			"[breakfast]\na@1 1\n\n[lunch]\nx@1 1\ny@1 2\nz@1 3\n\n[dinner]\nb@1 1\n",
		);
	});

	test("creates a new file with several entries", () => {
		expect(insertEntries([], "snack", ["x@1 1", '"y" kcal=2'], meals)).toBe(
			'[snack]\nx@1 1\n"y" kcal=2\n',
		);
	});

	test("appends a new section with several entries at the end of a file", () => {
		expect(
			insertEntries(
				parseDay("[breakfast]\na@1 1\n"),
				"dinner",
				["x@1 1", "y@1 2"],
				meals,
			),
		).toBe("[breakfast]\na@1 1\n\n[dinner]\nx@1 1\ny@1 2\n");
	});

	test.each([
		[
			"an existing section",
			"[breakfast]\na@1 1\n# note\n\n[lunch]\nb@1 1\n",
			"breakfast",
		],
		[
			"a new section in the middle",
			"[breakfast]\na@1 1\n[dinner]\nb@1 1\n",
			"lunch",
		],
		["a new section at the top", "[dinner]\nb@1 1\n", "breakfast"],
		["a new section at the end", "[breakfast]\na@1 1", "dinner"],
		["a new file", "", "snack"],
	])(
		"inserting a block into %s equals inserting its lines one at a time",
		(_name, original, meal) => {
			const entries = ["x@1 1", "y@1 2 g", '"z" kcal=3'];

			expect(insertEntries(parseDay(original), meal, entries, meals)).toBe(
				insertEach(original, meal, entries),
			);
		},
	);
});
