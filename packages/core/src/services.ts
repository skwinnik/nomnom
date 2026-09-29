import { createCatalog } from "./catalog/catalog";
import type { Clock } from "./clock/clock";
import {
	type ConfigService,
	createConfigService,
} from "./config/config-service";
import { dataPaths } from "./data-dir/paths";
import {
	createDayLogService,
	type DayLogService,
} from "./daylog/daylog-service";
import { createFoodService, type FoodService } from "./foods/food-service";
import type { FileSystem } from "./fs/file-system";
import { createNutrition } from "./nutrition/nutrition";
import {
	createRecipeService,
	type RecipeService,
} from "./recipes/recipe-service";
import {
	createReportService,
	type ReportService,
} from "./report/report-service";
import { createVersionedStore } from "./store/versioned-store";

/** What services depend on. The CLI supplies real adapters and values; tests supply mocks. */
export interface ServiceDependencies {
	fs: FileSystem;
	clock: Clock;
	/** The data directory, resolved by the CLI from `NOMNOM_DIR`. */
	dataDir: string;
}

/** Every core service the CLI uses. */
export interface Services {
	config: ConfigService;
	foods: FoodService;
	recipes: RecipeService;
	dayLog: DayLogService;
	report: ReportService;
}

/**
 * Wires all services together. It is the only place that knows how services
 * depend on each other, and it does no I/O.
 */
export function createServices(deps: ServiceDependencies): Services {
	const { fs, clock } = deps;
	const paths = dataPaths(deps.dataDir);
	const config = createConfigService({ fs, paths });
	const store = createVersionedStore({ fs, clock, paths });
	const catalog = createCatalog({ store });
	const nutrition = createNutrition({ catalog, config });
	const foods = createFoodService({ config, catalog, store });
	const recipes = createRecipeService({ config, catalog, nutrition, store });
	const dayLog = createDayLogService({ fs, clock, paths, config, catalog });
	const report = createReportService({
		fs,
		clock,
		paths,
		config,
		catalog,
		nutrition,
	});
	return { config, foods, recipes, dayLog, report };
}
