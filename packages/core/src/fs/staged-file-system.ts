import { normalize, sep } from "node:path";
import { NomnomError } from "../errors";
import {
	compareEntries,
	type DirectoryEntry,
	FileExistsError,
	type FileSystem,
} from "./file-system";

/** A file a command would write. */
export interface StagedWrite {
	path: string;
	/** The file's text before the command, or `undefined` for a new file. */
	before: string | undefined;
	/** The text the command would write. */
	after: string;
}

export interface StagedFileSystem extends FileSystem {
	/** The writes held so far, in the order their paths were first written. */
	staged(): StagedWrite[];
	/** Writes the held files to `inner` in that order, then forgets them. */
	commit(): Promise<void>;
}

interface Entry extends StagedWrite {
	/** The operation of the first write, replayed by `commit`. */
	operation: "create" | "replace";
}

/**
 * A `FileSystem` that holds every write in memory instead of passing it to
 * `inner`. Reads see the held writes, so a command runs as it would against
 * `inner`; `commit` then writes them, or they are dropped with the object.
 */
export function createStagedFileSystem(inner: FileSystem): StagedFileSystem {
	const entries = new Map<string, Entry>();

	/** The staged paths under a directory, relative to it. */
	const stagedUnder = (dir: string): string[] => {
		const key = normalize(dir);
		const prefix = key.endsWith(sep) ? key : `${key}${sep}`;
		return [...entries.keys()]
			.filter((path) => path.startsWith(prefix))
			.map((path) => path.slice(prefix.length));
	};

	return {
		async readText(path) {
			const entry = entries.get(normalize(path));
			return entry ? entry.after : inner.readText(path);
		},

		async exists(path) {
			if (entries.has(normalize(path))) return true;
			if (stagedUnder(path).length > 0) return true;
			return inner.exists(path);
		},

		async list(dir) {
			const merged = new Map<string, DirectoryEntry>();
			for (const entry of await inner.list(dir)) merged.set(entry.name, entry);
			for (const rest of stagedUnder(dir)) {
				const [name = "", ...deeper] = rest.split(sep);
				merged.set(name, {
					name,
					kind: deeper.length > 0 ? "directory" : "file",
				});
			}
			return [...merged.values()].sort(compareEntries);
		},

		async createExclusive(path, text) {
			const key = normalize(path);
			if (entries.has(key) || (await inner.exists(path))) {
				throw new FileExistsError(path);
			}
			entries.set(key, {
				path,
				operation: "create",
				before: undefined,
				after: text,
			});
		},

		async replaceAtomic(path, text) {
			const key = normalize(path);
			const entry = entries.get(key);
			if (entry) {
				entry.after = text;
				return;
			}
			entries.set(key, {
				path,
				operation: "replace",
				before: await inner.readText(path),
				after: text,
			});
		},

		staged() {
			return [...entries.values()].map(({ path, before, after }) => ({
				path,
				before,
				after,
			}));
		},

		async commit() {
			const pending = [...entries.values()];
			entries.clear();
			const written: string[] = [];
			for (const entry of pending) {
				try {
					if (entry.operation === "create") {
						await inner.createExclusive(entry.path, entry.after);
					} else {
						await inner.replaceAtomic(entry.path, entry.after);
					}
				} catch (error) {
					throw commitFailed(written, entry.path, error);
				}
				written.push(entry.path);
			}
		},
	};
}

/** The error of a commit that failed at `path`, naming the files already written. */
function commitFailed(
	written: readonly string[],
	path: string,
	error: unknown,
): NomnomError {
	const reason =
		error instanceof FileExistsError
			? "it was created by someone else meanwhile"
			: error instanceof Error
				? error.message
				: String(error);
	const message =
		written.length === 0
			? `Could not write ${path}`
			: `Wrote ${written.join(", ")}, but could not write ${path}`;
	return new NomnomError(message, [{ file: path, message: reason }]);
}
