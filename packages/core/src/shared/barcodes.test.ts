import { describe, expect, test } from "bun:test";
import { NomnomError } from "../errors";
import { normaliseBarcode, parseBarcode } from "./barcodes";

describe("parseBarcode", () => {
	test("trims and keeps leading zeros", () => {
		expect(parseBarcode(" 0123456789012 ")).toBe("0123456789012");
	});

	test.each(["abc", "46012abc", "", " ", "12 34", "-123", "1.5"])(
		"rejects %j",
		(raw) => {
			expect(() => parseBarcode(raw)).toThrow(NomnomError);
			expect(() => parseBarcode(raw)).toThrow("digits only");
		},
	);
});

describe("normaliseBarcode", () => {
	test.each([
		["034000470693", "0034000470693"],
		["0034000470693", "0034000470693"],
		["96385074", "96385074"],
		["12345", "00012345"],
		["00012345", "00012345"],
		["0", "00000000"],
		["0000000000000", "00000000"],
		["12345678901234", "12345678901234"],
		["123456789012345", "123456789012345"],
		["4601234567890", "4601234567890"],
	])("%j normalizes to %j", (barcode, normalized) => {
		expect(normaliseBarcode(barcode)).toBe(normalized);
	});

	test("a UPC-A code and its EAN-13 form are the same barcode", () => {
		expect(normaliseBarcode("034000470693")).toBe(
			normaliseBarcode("0034000470693"),
		);
	});
});
