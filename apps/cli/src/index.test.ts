import { expect, test } from "bun:test";
import { withSandbox } from "./e2e/nomnom";

test("--help prints the usage to stdout and exits 0", () =>
	withSandbox(async ({ nomnom }) => {
		const result = await nomnom("--help");

		expect(result.code).toBe(0);
		expect(result.out).toStartWith("Usage: nomnom <command> [options]");
		expect(result.err).toBe("");
	}));

test("an unknown command prints an error to stderr and exits 1", () =>
	withSandbox(async ({ nomnom }) => {
		const result = await nomnom("frobnicate");

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toContain("unknown command 'frobnicate'");
	}));
