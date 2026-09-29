import { describe, expect, test } from "bun:test";
import {
	isIsoDate,
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
