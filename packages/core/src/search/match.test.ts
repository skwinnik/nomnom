import { describe, expect, test } from "bun:test";
import { slugWords } from "../shared/slug";
import { editBudget, matchCost, wordCost } from "./match";

describe("editBudget", () => {
	test.each([
		[1, 0],
		[3, 0],
		[4, 1],
		[7, 1],
		[8, 2],
		[20, 2],
	])("a word of %i characters may need %i edits", (length, budget) => {
		expect(editBudget(length)).toBe(budget);
	});
});

describe("wordCost", () => {
	test.each([
		["yog", "yogurt", 0],
		["yogurt", "yogurt", 0],
		["yogrt", "yogurt", 1],
		["yogrut", "yogurt", 1],
		["chiken", "chicken", 1],
		["soop", "soup", 1],
		["ab", "apple", 1],
		["apple", "ample", 1],
		["yogurts", "yogurt", 1],
		["xyz", "yogurt", 2],
		["", "yogurt", 0],
		["abc", "", 3],
	])("%j against %j costs %i", (query, word, cost) => {
		expect(wordCost(query, word)).toBe(cost);
	});

	test("swapped adjacent letters count as one edit", () => {
		expect(wordCost("ab", "ba")).toBe(1);
		expect(wordCost("tvorgo", "tvorog")).toBe(1);
	});

	test("counts code points, not UTF-16 units", () => {
		expect(wordCost("a\u{1D400}", "a\u{1D401}")).toBe(1);
		expect(wordCost("тврог", "творог")).toBe(1);
	});
});

describe("matchCost", () => {
	const cost = (query: string, name: string) =>
		matchCost(slugWords(query), name);

	test.each([
		["yog", "Greek Yogurt 2%", 0],
		["yogrt", "Greek Yogurt 2%", 1],
		["yog greek", "Greek Yogurt 2%", 0],
		["greek yog", "Greek Yogurt 2%", 0],
		["chiken soop", "Chicken Soup", 2],
		["творог", "Творог 5%", 0],
		["apple", "Apple", 0],
		["apple", "Ample Bars", 1],
		["rice", "Brown Rice", 0],
	])("%j matches %j with %i edits", (query, name, edits) => {
		expect(cost(query, name)).toBe(edits);
	});

	test.each([
		["ab", "Apple"],
		["greek pancake", "Greek Yogurt 2%"],
		["4601234567890", "Greek Yogurt 2%"],
		["xyz", "Greek Yogurt 2%"],
	])("%j does not match %j", (query, name) => {
		expect(cost(query, name)).toBeUndefined();
	});

	test("takes the cheapest name word for each query word", () => {
		expect(cost("rice", "Rise Rice")).toBe(0);
	});
});
