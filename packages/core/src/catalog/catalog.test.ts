import { describe, expect, test } from "bun:test";
import { createFixedClock } from "../clock/__mocks__/clock";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import { createVersionedStore } from "../store/versioned-store";
import { serialiseFood } from "../store/write";
import { createCatalog, findOfKind, isArchived } from "./catalog";

function setup() {
	const store = createFakeStore({
		foods: {
			apple: [food({ name: "Apple" }), food({ name: "Apple", version: 2 })],
			pear: [
				food({ name: "Pear" }),
				food({ name: "Pear", version: 2, archived: true }),
			],
		},
		recipes: {
			pancakes: [recipe({ name: "Pancakes" })],
		},
	});
	return { store, catalog: createCatalog({ store }) };
}

describe("find", () => {
	test("finds foods and recipes by slug", async () => {
		const { catalog } = setup();

		expect((await catalog.find("apple"))?.kind).toBe("food");
		expect((await catalog.find("pancakes"))?.kind).toBe("recipe");
		expect(await catalog.find("unicorn")).toBeUndefined();
	});

	test("rejects a slug used in both foods/ and recipes/", async () => {
		const store = createFakeStore({
			foods: { pancakes: [food()] },
			recipes: { pancakes: [recipe()] },
		});

		await expect(createCatalog({ store }).find("pancakes")).rejects.toThrow(
			"'pancakes' is both a food and a recipe",
		);
	});
});

describe("resolve", () => {
	test("returns the latest version when none is given", async () => {
		const { catalog } = setup();

		const item = await catalog.resolve({ slug: "apple" });

		expect(item.kind).toBe("food");
		expect(item.record.version).toBe(2);
	});

	test("returns a specific version", async () => {
		const { catalog } = setup();

		expect(
			(await catalog.resolve({ slug: "apple", version: 1 })).record.version,
		).toBe(1);
	});

	test("rejects a version that does not exist, naming it", async () => {
		const { catalog } = setup();

		await expect(
			catalog.resolve({ slug: "apple", version: 7 }),
		).rejects.toThrow(
			"'apple@7' does not exist: food 'apple' has versions 1 to 2",
		);
	});

	test("rejects an unknown slug", async () => {
		const { catalog } = setup();

		const error = await catalog.resolve({ slug: "unicorn" }).catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toBe("'unicorn' is neither a food nor a recipe");
	});

	test("resolves pinned versions of an archived item", async () => {
		const { catalog } = setup();

		expect(
			(await catalog.resolve({ slug: "pear", version: 1 })).record.name,
		).toBe("Pear");
	});

	test("rejects a new reference to an archived item", async () => {
		const { catalog } = setup();

		for (const ref of [{ slug: "pear" }, { slug: "pear", version: 1 }]) {
			await expect(
				catalog.resolve(ref, { newReference: true }),
			).rejects.toThrow("'pear' is archived");
		}
	});
});

describe("isArchived", () => {
	test("is true only when the latest version is archived", async () => {
		const { catalog } = setup();
		const pear = await catalog.find("pear");
		const apple = await catalog.find("apple");

		expect(pear && isArchived(pear)).toBe(true);
		expect(apple && isArchived(apple)).toBe(false);
	});
});

describe("ensureSlugFree", () => {
	test("passes for an unused slug", async () => {
		const { catalog } = setup();

		await expect(catalog.ensureSlugFree("banana")).resolves.toBeUndefined();
	});

	test("names the kind that uses the slug", async () => {
		const { catalog } = setup();

		await expect(catalog.ensureSlugFree("apple")).rejects.toThrow(
			"'apple' already exists: it is already used by a food",
		);
		await expect(catalog.ensureSlugFree("pancakes")).rejects.toThrow(
			"already used by a recipe",
		);
		await expect(catalog.ensureSlugFree("pear")).rejects.toThrow("(archived)");
	});
});

test("reads each item at most once per run", async () => {
	const { store } = setup();
	let reads = 0;
	const catalog = createCatalog({
		store: {
			...store,
			readFood: (slug) => {
				reads++;
				return store.readFood(slug);
			},
		},
	});

	await catalog.resolve({ slug: "apple" });
	await catalog.resolve({ slug: "apple", version: 1 });
	await catalog.find("apple");

	expect(reads).toBe(1);
});

describe("all", () => {
	test("returns every food and recipe together, in slug order", async () => {
		const { catalog } = setup();

		const items = await catalog.all();

		expect(items.map((item) => [item.kind, item.slug])).toEqual([
			["food", "apple"],
			["recipe", "pancakes"],
			["food", "pear"],
		]);
	});

	test("rejects a slug used in both foods/ and recipes/", async () => {
		const store = createFakeStore({
			foods: { apple: [food()], pancakes: [food()] },
			recipes: { pancakes: [recipe()] },
		});

		await expect(createCatalog({ store }).all()).rejects.toThrow(
			"'pancakes' is both a food and a recipe",
		);
	});

	test("fails on a broken file, naming it", async () => {
		const store = createVersionedStore({
			fs: createMemoryFileSystem({
				"/data/foods/apple.yaml": serialiseFood(food({ name: "Apple" })),
				"/data/recipes/stew.yaml": "version: [",
			}),
			clock: createFixedClock(new Date("2026-09-29T17:10:00Z")),
			paths: dataPaths("/data"),
		});

		const error = await createCatalog({ store })
			.all()
			.catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toContain("/data/recipes/stew.yaml");
	});

	test("loads items through the find cache", async () => {
		const { store } = setup();
		let reads = 0;
		const catalog = createCatalog({
			store: {
				...store,
				readFood: (slug) => {
					reads++;
					return store.readFood(slug);
				},
			},
		});

		await catalog.all();
		await catalog.find("apple");

		// Once per slug: apple, pancakes and pear.
		expect(reads).toBe(3);
	});
});

describe("findOfKind", () => {
	test("returns an item of the kind", async () => {
		const { catalog } = setup();

		expect((await findOfKind(catalog, "apple", "food")).slug).toBe("apple");
		expect((await findOfKind(catalog, "pancakes", "recipe")).kind).toBe(
			"recipe",
		);
	});

	test("names the other kind or neither", async () => {
		const { catalog } = setup();

		await expect(findOfKind(catalog, "pancakes", "food")).rejects.toThrow(
			"'pancakes' is a recipe, not a food",
		);
		await expect(findOfKind(catalog, "apple", "recipe")).rejects.toThrow(
			"'apple' is a food, not a recipe",
		);
		await expect(findOfKind(catalog, "unicorn", "food")).rejects.toThrow(
			"'unicorn' is neither a food nor a recipe",
		);
	});
});
