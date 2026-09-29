import {
	type Catalog,
	type CatalogItem,
	findOfKind,
	type ItemSummary,
	isArchived,
	latestOf,
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
import { diffFood, type VersionChange } from "../store/diff";
import type { FoodVersion, NewFoodVersion } from "../store/records";
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

/** A food version written by `update`, and what changed from the latest version. */
export interface FoodUpdated {
	/** The slug of the written version: the old one, or a new one after a rename. */
	slug: string;
	/** The path of the file the version was added to, or of the created file. */
	path: string;
	food: FoodVersion;
	/** Present when the update renamed the food: the archiving version of the old one. */
	archived?: FoodArchived;
	/** Every difference from the latest version of the old food. */
	changes: VersionChange[];
}

/** The version `archive` or `unarchive` added. */
export interface FoodArchived {
	slug: string;
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
	/**
	 * Validates a food as `add` does and writes it as the next version of the
	 * food `slug`. When the name or barcodes give another slug, it creates that
	 * file instead and archives the old food. Writes nothing when anything is
	 * invalid, the food is archived or nothing changed.
	 */
	update(slug: string, input: FoodAddInput): Promise<FoodUpdated>;
	/** Adds a copy of the latest version with `archived: true`. */
	archive(slug: string): Promise<FoodArchived>;
	/** Adds a copy of the latest version without `archived`. */
	unarchive(slug: string): Promise<FoodArchived>;
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

	/**
	 * The non-archived foods whose latest version has a barcode with this
	 * normalized form, leaving out the food `exceptSlug`.
	 */
	const foodsWithBarcode = (
		foods: readonly FoodItem[],
		normalized: string,
		exceptSlug?: string,
	): FoodItem[] =>
		foods.filter(
			(item) =>
				item.slug !== exceptSlug &&
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

	/**
	 * Validates a food as typed and derives its slug, as `add` and `update` do.
	 * A barcode another non-archived food has is rejected, except that
	 * `exceptSlug` does not count as holding its own barcodes.
	 */
	const prepare = async (
		input: FoodAddInput,
		exceptSlug?: string,
	): Promise<{ slug: string; food: NewFoodVersion }> => {
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
			const [owner] = foodsWithBarcode(
				foods,
				normaliseBarcode(barcode),
				exceptSlug,
			);
			if (owner) {
				throw new NomnomError(
					`Barcode '${barcode}' already belongs to the food '${owner.slug}'`,
				);
			}
		}
		return {
			slug,
			food: { name, barcodes, baseUnit, per, nutrients, units },
		};
	};

	/** Adds a copy of the latest version with `archived` set as given. */
	const setArchived = async (
		item: FoodItem,
		archived: boolean,
	): Promise<FoodArchived> => {
		const latest = latestOf(item);
		const { path, record } = await store.appendFood(item.slug, {
			...latest,
			archived,
		});
		return { slug: item.slug, path, food: record };
	};

	return {
		async add(input) {
			const { slug, food } = await prepare(input);
			await catalog.ensureSlugFree(slug);
			const { path, record } = await store.createFood(slug, food);
			return { slug, path, food: record };
		},

		async update(slug, input) {
			const item = await findOfKind(catalog, slug, "food");
			if (isArchived(item)) {
				throw new NomnomError(
					`'${slug}' is archived and must be unarchived first`,
				);
			}
			const { slug: newSlug, food } = await prepare(input, slug);
			const latest = latestOf(item);
			const changes = diffFood(latest, food);
			if (newSlug === slug) {
				if (changes.length === 0) {
					throw new NomnomError(
						`Nothing changed: the values are those of ${slug}@${latest.version}`,
					);
				}
				const { path, record } = await store.appendFood(slug, food);
				return { slug, path, food: record, changes };
			}

			await catalog.ensureSlugFree(newSlug);
			const created = await store.createFood(newSlug, food);
			const archived = await setArchived(item, true);
			return {
				slug: newSlug,
				path: created.path,
				food: created.record,
				archived,
				changes,
			};
		},

		async archive(slug) {
			const item = await findOfKind(catalog, slug, "food");
			if (isArchived(item)) {
				throw new NomnomError(`'${slug}' is already archived`);
			}
			return setArchived(item, true);
		},

		async unarchive(slug) {
			const item = await findOfKind(catalog, slug, "food");
			if (!isArchived(item)) {
				throw new NomnomError(`'${slug}' is not archived`);
			}
			const foods = await allFoods();
			for (const barcode of latestOf(item).barcodes) {
				const [owner] = foodsWithBarcode(
					foods,
					normaliseBarcode(barcode),
					slug,
				);
				if (owner) {
					throw new NomnomError(
						`Can't unarchive '${slug}': barcode '${barcode}' now belongs to the food '${owner.slug}'`,
					);
				}
			}
			return setArchived(item, false);
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
