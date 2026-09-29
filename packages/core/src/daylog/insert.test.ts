import { describe, expect, test } from "bun:test";
import { insertEntry } from "./insert";
import { parseDay } from "./parse";

const meals = ["breakfast", "lunch", "dinner", "snack"];

function insert(text: string, meal: string, entry = "apple@2 1 g"): string {
	return insertEntry(parseDay(text), meal, entry, meals);
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

describe("insertEntry", () => {
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
});
