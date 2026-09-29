import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBunFileSystem } from "./bun-file-system";
import { FileExistsError } from "./file-system";
import { describeFileSystemContract } from "./file-system.contract";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "nomnom-fs-"));
	roots.push(root);
	return root;
}

afterAll(async () => {
	await Promise.all(
		roots.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describeFileSystemContract("createBunFileSystem", async () => ({
	fs: createBunFileSystem(),
	root: await tempRoot(),
}));

test("replaceAtomic leaves no temporary file behind", async () => {
	const fs = createBunFileSystem();
	const root = await tempRoot();
	const path = join(root, "day.nom");

	await fs.replaceAtomic(path, "first");
	await fs.replaceAtomic(path, "second");

	expect(await readdir(root)).toEqual(["day.nom"]);
	expect(await fs.readText(path)).toBe("second");
});

test("createExclusive never overwrites an existing file", async () => {
	const fs = createBunFileSystem();
	const root = await tempRoot();
	const path = join(root, "food.toml");
	await fs.replaceAtomic(path, "original");

	const attempts = await Promise.allSettled(
		Array.from({ length: 5 }, (_, i) =>
			fs.createExclusive(path, `attempt ${i}`),
		),
	);

	for (const attempt of attempts) {
		expect(attempt.status).toBe("rejected");
		if (attempt.status === "rejected") {
			expect(attempt.reason).toBeInstanceOf(FileExistsError);
		}
	}
	expect(await fs.readText(path)).toBe("original");
});

test("createExclusive lets exactly one of several concurrent writers win", async () => {
	const fs = createBunFileSystem();
	const root = await tempRoot();
	const path = join(root, "new.toml");

	const attempts = await Promise.allSettled(
		Array.from({ length: 5 }, (_, i) =>
			fs.createExclusive(path, `writer ${i}`),
		),
	);

	const winners = attempts.flatMap((attempt, i) =>
		attempt.status === "fulfilled" ? [i] : [],
	);
	expect(winners).toHaveLength(1);
	expect(await fs.readText(path)).toBe(`writer ${winners[0]}`);
});
