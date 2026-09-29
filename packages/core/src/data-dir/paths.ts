import { join } from "node:path";

/** The layout of the data directory: where each kind of file lives. */
export interface DataPaths {
	readonly root: string;
	readonly config: string;
	readonly foods: string;
	readonly recipes: string;
	readonly logs: string;
	food(slug: string): string;
	recipe(slug: string): string;
	/** The day file of a local date given as `yyyy-mm-dd`. */
	day(date: string): string;
}

export function dataPaths(root: string): DataPaths {
	const foods = join(root, "foods");
	const recipes = join(root, "recipes");
	const logs = join(root, "logs");
	return {
		root,
		config: join(root, "config.yaml"),
		foods,
		recipes,
		logs,
		food: (slug) => join(foods, `${slug}.yaml`),
		recipe: (slug) => join(recipes, `${slug}.yaml`),
		day: (date) => join(logs, date.slice(0, 4), `${date}.nom`),
	};
}
