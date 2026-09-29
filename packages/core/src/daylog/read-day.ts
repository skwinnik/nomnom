import type { Catalog } from "../catalog/catalog";
import type { Config } from "../config/config";
import type { DataPaths } from "../data-dir/paths";
import type { FileSystem } from "../fs/file-system";
import { type DayLine, parseDay } from "./parse";
import { type DayCheck, validateDay } from "./validate";

export interface DayFile {
	/** The day file, which may not exist. */
	path: string;
	lines: DayLine[];
	check: DayCheck;
}

/** Reads, parses and validates the day file of a date. A missing file counts as empty. */
export async function readDay(
	deps: { fs: FileSystem; paths: DataPaths; catalog: Catalog },
	config: Config,
	date: string,
): Promise<DayFile> {
	const path = deps.paths.day(date);
	const lines = parseDay((await deps.fs.readText(path)) ?? "");
	const check = await validateDay(lines, {
		config,
		catalog: deps.catalog,
		file: path,
	});
	return { path, lines, check };
}
