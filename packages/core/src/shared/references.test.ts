import { describe, expect, test } from "bun:test";
import { NomnomError } from "../errors";
import { parseAmountRef, parseItemRef } from "./references";

describe("parseItemRef", () => {
	test.each([
		["apple", { slug: "apple" }],
		["apple@2", { slug: "apple", version: 2 }],
		["творог-5@10", { slug: "творог-5", version: 10 }],
	])("parses %j", (text, expected) => {
		expect(parseItemRef(text)).toEqual(expected);
	});

	test.each([
		"",
		"@1",
		"apple@",
		"apple@0",
		"apple@1.5",
		"apple@x",
		"Apple Pie",
		"../x",
	])("rejects %j", (text) => {
		expect(() => parseItemRef(text)).toThrow(NomnomError);
	});
});

describe("parseAmountRef", () => {
	test.each([
		["rice=80", { slug: "rice", amount: 80 }],
		[
			"carrot@1=2 medium carrot",
			{ slug: "carrot", version: 1, amount: 2, unit: "medium carrot" },
		],
		[
			"chicken-breast=300 g",
			{ slug: "chicken-breast", amount: 300, unit: "g" },
		],
		[
			"pancake-batter=0.5   serving ",
			{ slug: "pancake-batter", amount: 0.5, unit: "serving" },
		],
		["can=1 a=b", { slug: "can", amount: 1, unit: "a=b" }],
	])("parses %j", (text, expected) => {
		expect(parseAmountRef(text)).toEqual(expected);
	});

	test.each([
		"rice",
		"rice=",
		"rice=abc",
		"rice=0 g",
		"rice=-1",
		"rice=1 can #2",
		"=5",
	])("rejects %j", (text) => {
		expect(() => parseAmountRef(text)).toThrow(NomnomError);
	});
});
