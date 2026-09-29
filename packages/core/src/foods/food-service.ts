import type { Catalog } from "../catalog/catalog";
import type { ConfigService } from "../config/config-service";
import { NomnomError } from "../errors";
import { parseNumber } from "../shared/numbers";
import { parseNutrientInput } from "../shared/nutrient-input";
import { slugify } from "../shared/slug";
import { normaliseUnitName, parseUnits } from "../shared/units";
import type { FoodVersion } from "../store/records";
import type { VersionedStore } from "../store/versioned-store";

/** A new food as typed on the command line: every value is still text. */
export interface FoodAddInput {
	name: string;
	baseUnit: string;
	/** Default 100. */
	per?: string;
	/** Values by nutrient id. */
	nutrients: Readonly<Record<string, string | undefined>>;
	/** `<name>=<amount>` each. */
	units?: readonly string[];
	barcodes?: readonly string[];
}

export interface FoodAdded {
	slug: string;
	/** The path of the created file. */
	path: string;
	food: FoodVersion;
}

export interface FoodService {
	/** Validates a new food and writes it as version 1. Writes nothing when anything is invalid. */
	add(input: FoodAddInput): Promise<FoodAdded>;
}

export function createFoodService(deps: {
	config: ConfigService;
	catalog: Catalog;
	store: VersionedStore;
}): FoodService {
	const { config, catalog, store } = deps;

	return {
		async add(input) {
			const { nutrients: nutrientCatalog } = await config.load();
			const name = input.name.trim();
			if (name === "") throw new NomnomError("The name must not be empty");
			const baseUnit = normaliseUnitName(input.baseUnit);
			const per = parseNumber(input.per ?? "100", "'per'", "positive");
			const nutrients = parseNutrientInput(input.nutrients, nutrientCatalog);
			const units = parseUnits(input.units ?? [], baseUnit);
			const barcodes = parseBarcodes(input.barcodes ?? []);

			const slug = slugify(name, barcodes[0]);
			await catalog.ensureSlugFree(slug);
			const { path, record } = await store.createFood(slug, {
				name,
				barcodes,
				baseUnit,
				per,
				nutrients,
				units,
			});
			return { slug, path, food: record };
		},
	};
}

function parseBarcodes(input: readonly string[]): string[] {
	const barcodes: string[] = [];
	for (const raw of input) {
		const barcode = raw.trim();
		if (!/^\d+$/.test(barcode)) {
			throw new NomnomError(`A barcode must contain digits only, got '${raw}'`);
		}
		if (barcodes.includes(barcode)) {
			throw new NomnomError(`Barcode '${barcode}' is given more than once`);
		}
		barcodes.push(barcode);
	}
	return barcodes;
}
