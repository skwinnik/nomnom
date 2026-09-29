import { describe, expect, test } from "bun:test";
import { createFixedClock } from "../clock/__mocks__/clock";
import { NomnomError } from "../errors";
import { createServices } from "../services";
import { createMemoryFileSystem } from "./__mocks__/file-system";
import type { FileSystem } from "./file-system";
import { describeFileSystemContract } from "./file-system.contract";
import { createStagedFileSystem } from "./staged-file-system";

describeFileSystemContract("createStagedFileSystem", async () => ({
	fs: createStagedFileSystem(createMemoryFileSystem()),
	root: "/data",
}));

async function rejection(promise: Promise<unknown>): Promise<NomnomError> {
	const error: unknown = await promise.catch((e) => e);
	expect(error).toBeInstanceOf(NomnomError);
	return error as NomnomError;
}

describe("staging", () => {
	test("creates, replaces and appends leave the inner file system unchanged", async () => {
		const inner = createMemoryFileSystem({ "/data/a.txt": "apple\n" });
		const fs = createStagedFileSystem(inner);

		await fs.createExclusive("/data/new/b.txt", "banana");
		await fs.replaceAtomic("/data/a.txt", "apricot\n");
		await fs.replaceAtomic("/data/a.txt", "apricot\navocado\n");

		expect([...inner.files]).toEqual([["/data/a.txt", "apple\n"]]);
	});

	test("reads, exists and list see the staged writes", async () => {
		const inner = createMemoryFileSystem({ "/data/a.txt": "apple" });
		const fs = createStagedFileSystem(inner);

		await fs.createExclusive("/data/c/d.txt", "date");
		await fs.replaceAtomic("/data/a.txt", "apricot");

		expect(await fs.readText("/data/a.txt")).toBe("apricot");
		expect(await fs.readText("/data/c/d.txt")).toBe("date");
		expect(await fs.exists("/data/c")).toBe(true);
		expect(await fs.exists("/data/c/d.txt")).toBe(true);
		expect(await fs.list("/data")).toEqual([
			{ name: "a.txt", kind: "file" },
			{ name: "c", kind: "directory" },
		]);
	});

	test("createExclusive refuses a staged path and one the inner file system has", async () => {
		const fs = createStagedFileSystem(
			createMemoryFileSystem({ "/data/a.txt": "apple" }),
		);
		await fs.replaceAtomic("/data/b.txt", "banana");

		await expect(fs.createExclusive("/data/a.txt", "x")).rejects.toMatchObject({
			name: "FileExistsError",
		});
		await expect(fs.createExclusive("/data/b.txt", "x")).rejects.toMatchObject({
			name: "FileExistsError",
		});
		expect(fs.staged()).toEqual([
			{ path: "/data/b.txt", before: undefined, after: "banana" },
		]);
	});

	test("staged reports the text before and the latest text, in first-write order", async () => {
		const fs = createStagedFileSystem(
			createMemoryFileSystem({ "/data/a.txt": "apple\n" }),
		);

		await fs.createExclusive("/data/new.txt", "one");
		await fs.replaceAtomic("/data/a.txt", "apple\napricot\n");
		await fs.replaceAtomic("/data/new.txt", "one\ntwo");

		expect(fs.staged()).toEqual([
			{ path: "/data/new.txt", before: undefined, after: "one\ntwo" },
			{ path: "/data/a.txt", before: "apple\n", after: "apple\napricot\n" },
		]);
	});
});

describe("commit", () => {
	test("writes the same files as a direct run, then forgets them", async () => {
		// One set of services per command, as the CLI builds them.
		const services = (fs: FileSystem) =>
			createServices({
				fs,
				clock: createFixedClock(new Date("2026-09-30T08:00:00Z")),
				dataDir: "/data",
			});
		const run = async (fs: FileSystem) => {
			await services(fs).foods.add({
				name: "Apple",
				baseUnit: "g",
				nutrients: { kcal: "52" },
			});
			await services(fs).foods.update("apple", {
				name: "Green Apple",
				baseUnit: "g",
				nutrients: { kcal: "52" },
			});
		};
		const direct = createMemoryFileSystem();
		await run(direct);
		const inner = createMemoryFileSystem();
		const staged = createStagedFileSystem(inner);
		await run(staged);

		await staged.commit();

		expect([...inner.files]).toEqual([...direct.files]);
		expect(staged.staged()).toEqual([]);
	});

	test("a failing write stops the commit and names the files written", async () => {
		const inner = createMemoryFileSystem({ "/data/foods/apple.yaml": "old" });
		const fs = createStagedFileSystem({
			...inner,
			replaceAtomic: async () => {
				throw new Error("disk full");
			},
		});
		await fs.createExclusive("/data/foods/green-apple.yaml", "new");
		await fs.replaceAtomic("/data/foods/apple.yaml", "archived");
		await fs.createExclusive("/data/foods/later.yaml", "later");

		const error = await rejection(fs.commit());

		expect(error.message).toBe(
			"Wrote /data/foods/green-apple.yaml, but could not write /data/foods/apple.yaml",
		);
		expect(error.problems).toEqual([
			{ file: "/data/foods/apple.yaml", message: "disk full" },
		]);
		expect([...inner.files]).toEqual([
			["/data/foods/apple.yaml", "old"],
			["/data/foods/green-apple.yaml", "new"],
		]);
	});

	test("a file created meanwhile is not overwritten", async () => {
		const inner = createMemoryFileSystem();
		const fs = createStagedFileSystem(inner);
		await fs.createExclusive("/data/a.txt", "ours");
		await inner.createExclusive("/data/a.txt", "theirs");

		const error = await rejection(fs.commit());

		expect(error.message).toBe("Could not write /data/a.txt");
		expect(error.problems).toEqual([
			{
				file: "/data/a.txt",
				message: "it was created by someone else meanwhile",
			},
		]);
		expect(inner.files.get("/data/a.txt")).toBe("theirs");
	});
});
