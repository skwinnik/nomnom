import { describe, expect, test } from "bun:test";
import { NomnomError } from "../errors";
import { parseNumber, tryParseNumber } from "./numbers";

describe("tryParseNumber", () => {
	test.each([
		["52", 52],
		["0.3", 0.3],
		[".5", 0.5],
		["5.", 5],
		[" 7 ", 7],
		["1e3", 1000],
		["-2", -2],
		["-0", 0],
	])("parses %j", (text, value) => {
		expect(tryParseNumber(text)).toBe(value);
	});

	test.each([
		"",
		" ",
		"abc",
		"NaN",
		"Infinity",
		"-Infinity",
		"0x10",
		"1,5",
		"1e999",
		"5kg",
	])("rejects %j", (text) => {
		expect(tryParseNumber(text)).toBeUndefined();
	});
});

describe("parseNumber", () => {
	test("accepts positive numbers for positive values", () => {
		expect(parseNumber("100", "--per", "positive")).toBe(100);
	});

	test("rejects zero and negatives for positive values", () => {
		expect(() => parseNumber("0", "--per", "positive")).toThrow(
			"--per must be a positive number",
		);
		expect(() => parseNumber("-1", "--per", "positive")).toThrow(NomnomError);
	});

	test("accepts zero for non-negative values and rejects negatives", () => {
		expect(parseNumber("0", "--kcal", "non-negative")).toBe(0);
		expect(() => parseNumber("-5", "--kcal", "non-negative")).toThrow(
			"--kcal must not be negative",
		);
	});

	test("names the value when it is not a number", () => {
		expect(() => parseNumber("", "--kcal", "non-negative")).toThrow(
			"--kcal must be a number, got ''",
		);
	});
});
