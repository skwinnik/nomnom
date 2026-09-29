import { describe, expect, test } from "bun:test";
import { NomnomError } from "./errors";

describe("NomnomError", () => {
	test("keeps its message and problems", () => {
		const problems = [
			{ file: "logs/2026/2026-09-28.nom", line: 4, message: "unknown food" },
			{ file: "foods/apple.toml", message: "missing name" },
		];
		const error = new NomnomError("Day file has errors", problems);

		expect(error.message).toBe("Day file has errors");
		expect(error.problems).toEqual(problems);
	});

	test("has no problems by default", () => {
		expect(new NomnomError("Oops").problems).toEqual([]);
	});

	test("is recognisable with instanceof", () => {
		const error: unknown = new NomnomError("Oops");

		expect(error).toBeInstanceOf(NomnomError);
		expect(error).toBeInstanceOf(Error);
		expect(new Error("Oops")).not.toBeInstanceOf(NomnomError);
	});
});
