import type { DataPaths } from "../data-dir/paths";
import { FileExistsError, type FileSystem } from "../fs/file-system";
import { type Config, DEFAULT_CONFIG_TEXT } from "./config";
import { parseConfig } from "./parse-config";

export interface ConfigService {
	/**
	 * Loads and validates `config.yaml`, creating it with the default config when
	 * it is missing. The result is cached for the run.
	 */
	load(): Promise<Config>;
}

export function createConfigService(deps: {
	fs: FileSystem;
	paths: DataPaths;
}): ConfigService {
	const { fs, paths } = deps;
	let loaded: Promise<Config> | undefined;

	const read = async (): Promise<Config> => {
		let text = await fs.readText(paths.config);
		if (text === undefined) {
			try {
				await fs.createExclusive(paths.config, DEFAULT_CONFIG_TEXT);
				text = DEFAULT_CONFIG_TEXT;
			} catch (error) {
				// Another run created it first: use theirs.
				if (!(error instanceof FileExistsError)) throw error;
				text = (await fs.readText(paths.config)) ?? DEFAULT_CONFIG_TEXT;
			}
		}
		return parseConfig(text, paths.config);
	};

	return {
		load() {
			loaded ??= read();
			return loaded;
		},
	};
}
