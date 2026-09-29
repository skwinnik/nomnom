import { join } from "node:path";
import type { DataPaths } from "../data-dir/paths";
import type { Problem } from "../errors";
import type { FileSystem } from "../fs/file-system";
import { isIsoDate } from "../shared/time";

export interface DayFiles {
	/** The date of every day file, in date order. */
	dates: string[];
	/** One problem per other `.nom` file, in path order. */
	invalid: Problem[];
}

/**
 * Walks `logs/` at any depth and sorts every `.nom` file into day files, at
 * `logs/<yyyy>/<yyyy-mm-dd>.nom` with a real date, and invalid files. Other
 * files and directories are ignored.
 */
export async function scanDayFiles(deps: {
	fs: FileSystem;
	paths: DataPaths;
}): Promise<DayFiles> {
	const { fs, paths } = deps;
	const dates: string[] = [];
	const invalid: Problem[] = [];

	const walk = async (dir: string): Promise<void> => {
		for (const entry of await fs.list(dir)) {
			const path = join(dir, entry.name);
			if (entry.kind === "directory") {
				await walk(path);
				continue;
			}
			if (!entry.name.endsWith(".nom")) continue;
			const date = entry.name.slice(0, -".nom".length);
			if (isIsoDate(date) && paths.day(date) === path) {
				dates.push(date);
			} else {
				invalid.push({
					file: path,
					message: "not a day file: day files are logs/<yyyy>/<yyyy-mm-dd>.nom",
				});
			}
		}
	};

	await walk(paths.logs);
	// By path, not walk order: the walk visits `2026/` before `2026-09-30.nom`.
	invalid.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
	return { dates: dates.sort(), invalid };
}
