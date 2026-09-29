import { describe, expect, test } from "bun:test";
import { createFixedClock } from "./__mocks__/clock";
import { createSystemClock } from "./system-clock";

describe("createSystemClock", () => {
	test("returns the current time", () => {
		const before = Date.now();
		const now = createSystemClock().now().getTime();
		const after = Date.now();

		expect(now).toBeGreaterThanOrEqual(before);
		expect(now).toBeLessThanOrEqual(after);
	});
});

describe("createFixedClock", () => {
	test("returns the given time", () => {
		const clock = createFixedClock(new Date("2026-09-28T08:00:00Z"));

		expect(clock.now().toISOString()).toBe("2026-09-28T08:00:00.000Z");
		expect(clock.now().toISOString()).toBe("2026-09-28T08:00:00.000Z");
	});

	test("returns the time set later", () => {
		const clock = createFixedClock(new Date("2026-09-28T08:00:00Z"));
		clock.set(new Date("2026-09-29T12:30:00Z"));

		expect(clock.now().toISOString()).toBe("2026-09-29T12:30:00.000Z");
	});

	test("is not affected by mutating a returned date", () => {
		const clock = createFixedClock(new Date("2026-09-28T08:00:00Z"));
		clock.now().setFullYear(2000);

		expect(clock.now().toISOString()).toBe("2026-09-28T08:00:00.000Z");
	});
});
