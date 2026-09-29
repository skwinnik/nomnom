import { describe, expect, test } from "bun:test";
import { NomnomError } from "../errors";
import { compareSlugs, isSlug, slugify, slugWords } from "./slug";

describe("slugify", () => {
	test.each([
		["Greek Yogurt 2%", undefined, "greek-yogurt-2"],
		["Greek Yogurt 2%", "4601234567890", "greek-yogurt-2-4601234567890"],
		["Milk", "0123456789012", "milk-0123456789012"],
		["Творог 5%", undefined, "творог-5"],
		["  --Apple!!  ", undefined, "apple"],
		["Crème brûlée", undefined, "crème-brûlée"],
	])("%j with barcode %j is %j", (name, barcode, slug) => {
		expect(slugify(name, barcode)).toBe(slug);
	});

	test("normalises to NFC so both spellings of é give the same slug", () => {
		const composed = "Café";
		const decomposed = "Café";

		expect(slugify(decomposed)).toBe(slugify(composed));
		expect(slugify(composed)).toBe("café");
	});

	test("rejects a name with no letters or digits", () => {
		expect(() => slugify("%%%")).toThrow(NomnomError);
		expect(() => slugify("%%%", "123")).toThrow(NomnomError);
	});
});

describe("slugWords", () => {
	test.each([
		["Greek Yogurt 2%", ["greek", "yogurt", "2"]],
		["Творог 5%", ["творог", "5"]],
		["%%", []],
		["  --Apple!!  ", ["apple"]],
		["", []],
	])("%j splits into %j", (text, words) => {
		expect(slugWords(text)).toEqual(words);
	});

	test("normalises to NFC", () => {
		expect(slugWords("Café")).toEqual(["café"]);
	});
});

describe("compareSlugs", () => {
	test("orders by code point, a prefix first", () => {
		expect(
			["b", "a-b", "a", "Z", "я", "\u{1D400}", "ａ"].sort(compareSlugs),
		).toEqual(["Z", "a", "a-b", "b", "я", "ａ", "\u{1D400}"]);
	});
});

describe("isSlug", () => {
	test.each(["apple", "greek-yogurt-2-460123", "творог-5"])(
		"accepts %j",
		(text) => expect(isSlug(text)).toBe(true),
	);

	test.each(["", "Apple Pie", "../etc", "a/b", "-a", "a--b", "a.b"])(
		"rejects %j",
		(text) => expect(isSlug(text)).toBe(false),
	);
});
