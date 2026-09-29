import { expect, test } from "bun:test";
import { join } from "node:path";

const entry = join(import.meta.dir, "index.ts");

async function nomnom(...args: string[]) {
	const proc = Bun.spawn(["bun", entry, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, out, err };
}

test("--help prints the usage to stdout and exits 0", async () => {
	const result = await nomnom("--help");

	expect(result.code).toBe(0);
	expect(result.out).toStartWith("Usage: nomnom <command> [options]");
	expect(result.err).toBe("");
});

test("an unknown command prints an error to stderr and exits 1", async () => {
	const result = await nomnom("frobnicate");

	expect(result.code).toBe(1);
	expect(result.out).toBe("");
	expect(result.err).toContain("unknown command 'frobnicate'");
});
