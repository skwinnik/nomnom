import { expect, test } from "bun:test";
import { describeFileSystemContract } from "../file-system.contract";
import { createMemoryFileSystem } from "./file-system";

describeFileSystemContract("createMemoryFileSystem", async () => ({
	fs: createMemoryFileSystem(),
	root: "/data",
}));

test("createMemoryFileSystem starts with the given files", async () => {
	const fs = createMemoryFileSystem({ "/data/a.txt": "apple" });

	expect(await fs.readText("/data/a.txt")).toBe("apple");
	expect(await fs.list("/data")).toEqual([{ name: "a.txt", kind: "file" }]);
});

test("createMemoryFileSystem exposes its files by normalised path", async () => {
	const fs = createMemoryFileSystem();
	await fs.createExclusive("/data//x/../a.txt", "apple");

	expect([...fs.files]).toEqual([["/data/a.txt", "apple"]]);
});
