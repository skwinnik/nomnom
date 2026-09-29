import { posix } from "node:path";
import {
	compareEntries,
	type DirectoryEntry,
	FileExistsError,
	type FileSystem,
} from "../file-system";

export interface MemoryFileSystem extends FileSystem {
	/** Every file and its contents, keyed by normalised absolute path. */
	readonly files: Map<string, string>;
}

/**
 * An in-memory `FileSystem`. Directories are implied by the files below them.
 * Relative paths are resolved against `/`.
 */
export function createMemoryFileSystem(
	initial: Record<string, string> = {},
): MemoryFileSystem {
	const files = new Map<string, string>();
	for (const [path, text] of Object.entries(initial)) {
		files.set(normalise(path), text);
	}

	const isDirectory = (path: string): boolean => {
		const prefix = path === "/" ? "/" : `${path}/`;
		for (const file of files.keys()) {
			if (file.startsWith(prefix)) return true;
		}
		return false;
	};

	const checkParents = (path: string): void => {
		for (let dir = posix.dirname(path); dir !== "/"; dir = posix.dirname(dir)) {
			if (files.has(dir)) throw new Error(`Not a directory: ${dir}`);
		}
	};

	const checkNotDirectory = (path: string): void => {
		if (isDirectory(path)) throw new Error(`Is a directory: ${path}`);
	};

	return {
		files,

		async readText(path) {
			const key = normalise(path);
			checkNotDirectory(key);
			return files.get(key);
		},

		async exists(path) {
			const key = normalise(path);
			return files.has(key) || isDirectory(key);
		},

		async list(dir) {
			const key = normalise(dir);
			const prefix = key === "/" ? "/" : `${key}/`;
			const entries = new Map<string, DirectoryEntry>();
			for (const file of files.keys()) {
				if (!file.startsWith(prefix)) continue;
				const [name = "", ...rest] = file.slice(prefix.length).split("/");
				entries.set(name, {
					name,
					kind: rest.length > 0 ? "directory" : "file",
				});
			}
			return [...entries.values()].sort(compareEntries);
		},

		async createExclusive(path, text) {
			const key = normalise(path);
			checkParents(key);
			if (files.has(key) || isDirectory(key)) throw new FileExistsError(path);
			files.set(key, text);
		},

		async replaceAtomic(path, text) {
			const key = normalise(path);
			checkParents(key);
			checkNotDirectory(key);
			files.set(key, text);
		},
	};
}

function normalise(path: string): string {
	return posix.resolve("/", path);
}
