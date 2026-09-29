import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { FileExistsError, type FileSystem } from "./file-system";

export interface FileSystemFixture {
	fs: FileSystem;
	/** An empty directory the cases may write into. */
	root: string;
}

/**
 * Behaviour every `FileSystem` must have. Run by the tests of the in-memory mock
 * and of each adapter, so the mock cannot drift from the real file system.
 */
export function describeFileSystemContract(
	name: string,
	setup: () => Promise<FileSystemFixture>,
): void {
	describe(`${name} (FileSystem contract)`, () => {
		test("readText returns undefined for a missing file", async () => {
			const { fs, root } = await setup();

			expect(await fs.readText(join(root, "missing.txt"))).toBeUndefined();
		});

		test("createExclusive writes a new file that readText returns", async () => {
			const { fs, root } = await setup();
			const path = join(root, "a.txt");

			await fs.createExclusive(path, "apple");

			expect(await fs.readText(path)).toBe("apple");
		});

		test("createExclusive fails with FileExistsError and keeps the file", async () => {
			const { fs, root } = await setup();
			const path = join(root, "a.txt");
			await fs.createExclusive(path, "first");

			await expect(fs.createExclusive(path, "second")).rejects.toBeInstanceOf(
				FileExistsError,
			);
			expect(await fs.readText(path)).toBe("first");
		});

		test("createExclusive implies parent directories", async () => {
			const { fs, root } = await setup();

			await fs.createExclusive(join(root, "x/y/z.txt"), "deep");

			expect(await fs.exists(join(root, "x"))).toBe(true);
			expect(await fs.exists(join(root, "x/y"))).toBe(true);
			expect(await fs.readText(join(root, "x/y/z.txt"))).toBe("deep");
		});

		test("replaceAtomic creates a file and its parent directories", async () => {
			const { fs, root } = await setup();
			const path = join(root, "p/q.txt");

			await fs.replaceAtomic(path, "new");

			expect(await fs.readText(path)).toBe("new");
		});

		test("replaceAtomic replaces an existing file", async () => {
			const { fs, root } = await setup();
			const path = join(root, "a.txt");
			await fs.createExclusive(path, "old");

			await fs.replaceAtomic(path, "new");

			expect(await fs.readText(path)).toBe("new");
		});

		test("exists tells files and directories from missing paths", async () => {
			const { fs, root } = await setup();
			await fs.createExclusive(join(root, "d/f.txt"), "");

			expect(await fs.exists(join(root, "d/f.txt"))).toBe(true);
			expect(await fs.exists(join(root, "d"))).toBe(true);
			expect(await fs.exists(join(root, "nope"))).toBe(false);
		});

		test("list returns entries sorted by name with their kinds", async () => {
			const { fs, root } = await setup();
			await fs.createExclusive(join(root, "c.txt"), "");
			await fs.createExclusive(join(root, "a/inner.txt"), "");
			await fs.createExclusive(join(root, "b.txt"), "");
			await fs.createExclusive(join(root, "a/deeper/more.txt"), "");

			expect(await fs.list(root)).toEqual([
				{ name: "a", kind: "directory" },
				{ name: "b.txt", kind: "file" },
				{ name: "c.txt", kind: "file" },
			]);
			expect(await fs.list(join(root, "a"))).toEqual([
				{ name: "deeper", kind: "directory" },
				{ name: "inner.txt", kind: "file" },
			]);
		});

		test("list returns an empty list for a missing directory", async () => {
			const { fs, root } = await setup();

			expect(await fs.list(join(root, "missing"))).toEqual([]);
		});
	});
}
