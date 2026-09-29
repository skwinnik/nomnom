import type { Config } from "../config";
import type { ConfigService } from "../config-service";

/** The default config, as a value. */
export const defaultConfig: Config = {
	nutrients: [
		{ id: "kcal", name: "Energy", unit: "kcal", required: true },
		{ id: "protein", name: "Protein", unit: "g", required: false },
		{ id: "fat", name: "Fat", unit: "g", required: false },
		{ id: "carbs", name: "Carbohydrates", unit: "g", required: false },
		{ id: "fiber", name: "Fiber", unit: "g", required: false },
	],
	meals: ["breakfast", "lunch", "dinner", "snack"],
};

/** A config service that returns the given config without touching files. */
export function createStaticConfigService(
	config: Config = defaultConfig,
): ConfigService {
	return { load: async () => config };
}
