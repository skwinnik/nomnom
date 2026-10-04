import { describe, expect, test } from "bun:test";
import {
	datesBetween,
	isIsoDate,
	isTimeOfDay,
	isTimestampWithOffset,
	localDate,
	localTimestamp,
} from "./time";

describe("localTimestamp", () => {
	test("formats local time with the offset of that moment", () => {
		const date = new Date(2026, 8, 29, 20, 10, 5);
		const text = localTimestamp(date);

		expect(text).toStartWith("2026-09-29T20:10:05");
		expect(isTimestampWithOffset(text)).toBe(true);
		expect(new Date(text).getTime()).toBe(date.getTime());
	});
});

describe("localDate", () => {
	test("uses the local calendar date", () => {
		expect(localDate(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02");
	});
});

describe("isIsoDate", () => {
	test.each(["2026-09-29", "2024-02-29"])("accepts %j", (text) => {
		expect(isIsoDate(text)).toBe(true);
	});

	test.each(["2026-9-29", "2026-02-30", "2026-13-01", "today", ""])(
		"rejects %j",
		(text) => {
			expect(isIsoDate(text)).toBe(false);
		},
	);
});

describe("isTimeOfDay", () => {
	test.each(["00:00", "09:05", "23:59"])("accepts %j", (text) => {
		expect(isTimeOfDay(text)).toBe(true);
	});

	test.each([
		"24:00",
		"12:60",
		"8:15",
		"08:5",
		"0815",
		"08:15:30",
		"8:15pm",
		" 08:15",
		"８:15",
		"",
	])("rejects %j", (text) => {
		expect(isTimeOfDay(text)).toBe(false);
	});
});

describe("isTimestampWithOffset", () => {
	test.each(["2026-09-29T20:10:00+03:00", "2026-09-29T17:10:00Z"])(
		"accepts %j",
		(text) => expect(isTimestampWithOffset(text)).toBe(true),
	);

	test.each(["2026-09-29T20:10:00", "2026-09-29", "yesterday"])(
		"rejects %j",
		(text) => expect(isTimestampWithOffset(text)).toBe(false),
	);
});

describe("datesBetween", () => {
	test("lists a single day", () => {
		expect(datesBetween("2026-09-29", "2026-09-29")).toEqual(["2026-09-29"]);
	});

	test("crosses a month boundary", () => {
		expect(datesBetween("2026-09-29", "2026-10-02")).toEqual([
			"2026-09-29",
			"2026-09-30",
			"2026-10-01",
			"2026-10-02",
		]);
	});

	test("crosses a year boundary", () => {
		expect(datesBetween("2026-12-31", "2027-01-01")).toEqual([
			"2026-12-31",
			"2027-01-01",
		]);
	});

	test("includes 29 February in a leap year", () => {
		expect(datesBetween("2028-02-28", "2028-03-01")).toEqual([
			"2028-02-28",
			"2028-02-29",
			"2028-03-01",
		]);
		expect(datesBetween("2026-02-28", "2026-03-01")).toEqual([
			"2026-02-28",
			"2026-03-01",
		]);
	});

	test("is empty when the end is before the start", () => {
		expect(datesBetween("2026-09-29", "2026-09-28")).toEqual([]);
	});
});
