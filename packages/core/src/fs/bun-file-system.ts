import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	compareEntries,
	type DirectoryEntry,
	FileExistsError,
	type FileSystem,
} from "./file-system";

/** The real file system, through `node:fs` as implemented by Bun. */
export function createBunFileSystem(): FileSystem {
	return {
		async readText(path) {
			try {
				return await readFile(path, "utf8");
			} catch (error) {
				if (hasCode(error, "ENOENT")) return undefined;
				throw error;
			}
		},

		async exists(path) {
			try {
				await stat(path);
				return true;
			} catch (error) {
				if (hasCode(error, "ENOENT")) return false;
				throw error;
			}
		},

		async list(dir) {
			try {
				const dirents = await readdir(dir, { withFileTypes: true });
				return dirents
					.map(
						(dirent): DirectoryEntry => ({
							name: dirent.name,
							kind: dirent.isDirectory() ? "directory" : "file",
						}),
					)
					.sort(compareEntries);
			} catch (error) {
				if (hasCode(error, "ENOENT")) return [];
				throw error;
			}
		},

		async createExclusive(path, text) {
			await mkdir(dirname(path), { recursive: true });
			try {
				await writeFile(path, text, { encoding: "utf8", flag: "wx" });
			} catch (error) {
				if (hasCode(error, "EEXIST")) throw new FileExistsError(path);
				throw error;
			}
		},

		async replaceAtomic(path, text) {
			const dir = dirname(path);
			await mkdir(dir, { recursive: true });
			const temp = join(dir, `.${basename(path)}.${crypto.randomUUID()}.tmp`);
			try {
				await writeFile(temp, text, { encoding: "utf8", flag: "wx" });
				await rename(temp, path);
			} catch (error) {
				await rm(temp, { force: true });
				throw error;
			}
		},
	};
}

function hasCode(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}
