export interface DirectoryEntry {
	name: string;
	kind: "file" | "directory";
}

/**
 * The file operations the domain needs. Deliberately narrow: it grows only when
 * a feature needs a new operation, so the in-memory mock can stay faithful.
 */
export interface FileSystem {
	/** File contents, or `undefined` when the file does not exist. */
	readText(path: string): Promise<string | undefined>;
	/** Whether a file or directory exists. */
	exists(path: string): Promise<boolean>;
	/** Entries sorted by name; empty when the directory does not exist. */
	list(dir: string): Promise<DirectoryEntry[]>;
	/** Creates parent directories and writes a new file; throws `FileExistsError` if it exists. */
	createExclusive(path: string, text: string): Promise<void>;
	/** Creates parent directories and replaces the file atomically (temporary file plus rename). */
	replaceAtomic(path: string, text: string): Promise<void>;
}

export class FileExistsError extends Error {
	override readonly name = "FileExistsError";
	readonly path: string;

	constructor(path: string) {
		super(`File already exists: ${path}`);
		this.path = path;
	}
}

/** Orders entries by name, by code point, so the order does not depend on the locale. */
export function compareEntries(a: DirectoryEntry, b: DirectoryEntry): number {
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
