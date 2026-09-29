import { describe, expect, test } from "bun:test";
import { NomnomError } from "../errors";
import { normaliseUnitName, parseUnitDefinition } from "./units";

describe("normaliseUnitName", () => {
	test("trims and collapses whitespace", () => {
		expect(normaliseUnitName("  medium \t sized   apple ")).toBe(
			"medium sized apple",
		);
	});

	test("keeps case", () => {
		expect(normaliseUnitName("Cup")).toBe("Cup");
	});

	test.each(["", "   ", "can #2", "#"])("rejects %j", (raw) => {
		expect(() => normaliseUnitName(raw)).toThrow(NomnomError);
	});

	test("explains that unit names can't contain #", () => {
		expect(() => normaliseUnitName("can #2")).toThrow("can't contain '#'");
	});
});

describe("parseUnitDefinition", () => {
	test.each([
		["small sized apple=134", { name: "small sized apple", amount: 134 }],
		["100g=100", { name: "100g", amount: 100 }],
		["a=b=5", { name: "a=b", amount: 5 }],
		["cup = 240.5", { name: "cup", amount: 240.5 }],
	])("parses %j", (text, expected) => {
		expect(parseUnitDefinition(text)).toEqual(expected);
	});

	test.each([
		"cup",
		"cup=",
		"cup=abc",
		"cup=0",
		"cup=-5",
		"=5",
		"can #2=400",
		"cup=Infinity",
		"cup=NaN",
	])("rejects %j", (text) => {
		expect(() => parseUnitDefinition(text)).toThrow(NomnomError);
	});
});
