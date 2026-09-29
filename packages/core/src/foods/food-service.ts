import {
	type Catalog,
	type CatalogItem,
	type ItemSummary,
	isArchived,
	pickVersion,
	summarise,
} from "../catalog/catalog";
import type { ConfigService } from "../config/config-service";
import { NomnomError } from "../errors";
import { normaliseBarcode, parseBarcode } from "../shared/barcodes";
import { parseNumber } from "../shared/numbers";
import { parseNutrientInput } from "../shared/nutrient-input";
import { settleInOrder } from "../shared/promises";
import { parseItemRef } from "../shared/references";
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

/** Which food to show: exactly one of a `<slug>[@<version>]` reference and a barcode. */
export interface FoodShowInput {
	ref?: string;
	barcode?: string;
}

/** A catalog nutrient with the value a food version stores, if any. */
export interface StoredNutrient {
	id: string;
	name: string;
	unit: string;
	/** Exactly as stored, or `undefined` when the version doesn't give it. */
	value: number | undefined;
}

export interface FoodShown {
	slug: string;
	/** The shown version. */
	food: FoodVersion;
	latestVersion: number;
	/** Whether the food is archived: its latest version is. */
	archived: boolean;
	/** Every nutrient in the current catalog, in catalog order. */
	nutrients: StoredNutrient[];
}

export interface FoodService {
	/** Validates a new food and writes it as version 1. Writes nothing when anything is invalid. */
	add(input: FoodAddInput): Promise<FoodAdded>;
	/** Every non-archived food by its latest version, in slug order. */
	list(): Promise<ItemSummary[]>;
	/** One version of a food, found by reference or by barcode. */
	show(input: FoodShowInput): Promise<FoodShown>;
}

type FoodItem = CatalogItem & { kind: "food" };

export function createFoodService(deps: {
	config: ConfigService;
	catalog: Catalog;
	store: VersionedStore;
}): FoodService {
	const { config, catalog, store } = deps;

	/** Every food, in slug order. Fails when any food file is invalid. */
	const allFoods = async (): Promise<FoodItem[]> => {
		const slugs = await store.foodSlugs();
		const versions = await settleInOrder(
			slugs.map((slug) => store.readFood(slug)),
		);
		return slugs.flatMap((slug, i) => {
			const found = versions[i];
			return found ? [{ kind: "food" as const, slug, versions: found }] : [];
		});
	};

	/** The non-archived foods whose latest version has a barcode with this normalized form. */
	const foodsWithBarcode = (
		foods: readonly FoodItem[],
		normalized: string,
	): FoodItem[] =>
		foods.filter(
			(item) =>
				!isArchived(item) &&
				item.versions
					.at(-1)
					?.barcodes.some((code) => normaliseBarcode(code) === normalized),
		);

	const findByBarcode = async (raw: string): Promise<FoodItem> => {
		const barcode = parseBarcode(raw);
		const normalized = normaliseBarcode(barcode);
		const matches = foodsWithBarcode(await allFoods(), normalized);
		const [match] = matches;
		if (!match) {
			throw new NomnomError(
				`No food has the barcode '${barcode}' (normalized: ${normalized})`,
			);
		}
		if (matches.length > 1) {
			const refs = matches.map(
				(item) => `${item.slug}@${item.versions.length}`,
			);
			throw new NomnomError(
				`Several foods have the barcode '${barcode}': ${refs.join(", ")}`,
			);
		}
		return match;
	};

	const findBySlug = async (slug: string): Promise<FoodItem> => {
		const versions = await store.readFood(slug);
		if (!versions) throw new NomnomError(`There is no food '${slug}'`);
		return { kind: "food", slug, versions };
	};

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

			const foods = await allFoods();
			for (const barcode of barcodes) {
				const [owner] = foodsWithBarcode(foods, normaliseBarcode(barcode));
				if (owner) {
					throw new NomnomError(
						`Barcode '${barcode}' already belongs to the food '${owner.slug}'`,
					);
				}
			}
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

		async list() {
			return (await allFoods())
				.filter((item) => !isArchived(item))
				.map(summarise);
		},

		async show(input) {
			if ((input.ref === undefined) === (input.barcode === undefined)) {
				throw new NomnomError(
					"Give exactly one of a food and --barcode to show a food",
				);
			}
			let item: FoodItem;
			let version: number | undefined;
			if (input.ref !== undefined) {
				const ref = parseItemRef(input.ref);
				item = await findBySlug(ref.slug);
				version = ref.version;
			} else {
				item = await findByBarcode(input.barcode ?? "");
			}
			const food = pickVersion(item, version);
			const { nutrients: nutrientCatalog } = await config.load();
			return {
				slug: item.slug,
				food,
				latestVersion: item.versions.length,
				archived: isArchived(item),
				nutrients: nutrientCatalog.map(({ id, name, unit }) => ({
					id,
					name,
					unit,
					value: food.nutrients.get(id),
				})),
			};
		},
	};
}

/**
 * Parses barcodes, rejecting two that are the same after normalization. Runs
 * before any file is read.
 */
function parseBarcodes(input: readonly string[]): string[] {
	const barcodes: string[] = [];
	for (const raw of input) {
		const barcode = parseBarcode(raw);
		const same = barcodes.find(
			(other) => normaliseBarcode(other) === normaliseBarcode(barcode),
		);
		if (same === barcode) {
			throw new NomnomError(`Barcode '${barcode}' is given more than once`);
		}
		if (same !== undefined) {
			throw new NomnomError(
				`Barcodes '${same}' and '${barcode}' are the same barcode`,
			);
		}
		barcodes.push(barcode);
	}
	return barcodes;
}
