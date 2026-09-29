import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config/__mocks__/config-service";
import { NomnomError } from "../errors";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import { createCatalog } from "./catalog";
import {
	type ReferenceOptions,
	resolveReference,
	TargetError,
} from "./reference";

const store = createFakeStore({
	foods: {
		apple: [
			food({ nutrients: { kcal: 52 }, units: { "small sized apple": 134 } }),
			food({ version: 2, nutrients: { protein: 0.3, protien: 1 } }),
		],
		pear: [
			food({ nutrients: { kcal: 57 } }),
			food({ version: 2, nutrients: { kcal: 57 }, archived: true }),
		],
		both: [food({ nutrients: { kcal: 1 } })],
	},
	recipes: {
		batter: [recipe({ servings: 2 })],
		both: [recipe()],
	},
});

function resolve(
	ref: { slug: string; version?: number },
	options?: ReferenceOptions,
) {
	return resolveReference(
		{ catalog: createCatalog({ store }), config: defaultConfig },
		ref,
		options,
	);
}

async function failure(promise: Promise<unknown>): Promise<NomnomError> {
	const error = await promise.then(
		() => undefined,
		(e: unknown) => e,
	);
	if (!(error instanceof NomnomError)) throw new Error("expected a failure");
	return error;
}

describe("resolveReference", () => {
	test("resolves a pinned version with its default unit", async () => {
		const { item, unit } = await resolve({ slug: "apple", version: 1 });

		expect(item.kind).toBe("food");
		expect(item.record.version).toBe(1);
		expect(unit).toBe("g");
	});

	test("resolves the latest version and keeps a given unit", async () => {
		const { item, unit } = await resolve(
			{ slug: "batter" },
			{ unit: "serving", kind: "recipe" },
		);

		expect(item.slug).toBe("batter");
		expect(unit).toBe("serving");
	});

	test("resolves an archived item's pinned version", async () => {
		const { item } = await resolve({ slug: "pear", version: 1 });

		expect(item.record.version).toBe(1);
	});

	test.each<
		[string, { slug: string; version?: number }, ReferenceOptions, string]
	>([
		[
			"an unknown slug",
			{ slug: "unicorn", version: 1 },
			{},
			"'unicorn' is neither a food nor a recipe",
		],
		[
			"an archived item on a new reference",
			{ slug: "pear" },
			{ newReference: true },
			"'pear' is archived and can't be newly referenced",
		],
		[
			"a missing version",
			{ slug: "apple", version: 7 },
			{},
			"'apple@7' does not exist: food 'apple' has versions 1 to 2",
		],
		[
			"the other kind",
			{ slug: "batter", version: 1 },
			{ kind: "food" },
			"'batter' is a recipe, not a food",
		],
		[
			"a unit the version doesn't allow",
			{ slug: "apple", version: 1 },
			{ unit: "cup" },
			"'cup' is not a unit of apple@1; it allows 'g', 'small sized apple'",
		],
	])(
		"rejects %s as a problem of the reference",
		async (_name, ref, options, message) => {
			const error = await failure(resolve(ref, options));

			expect(error).not.toBeInstanceOf(TargetError);
			expect(error.message).toBe(message);
		},
	);

	test("rejects an unusable food version as a problem of the target, naming each nutrient", async () => {
		const error = await failure(resolve({ slug: "apple", version: 2 }));

		expect(error).toBeInstanceOf(TargetError);
		expect(error.message).toBe(
			"'apple@2' is unusable: 'protien' is not a nutrient in config.yaml; the required nutrient 'kcal' is missing",
		);
	});

	test("checks usability before the unit", async () => {
		const error = await failure(
			resolve({ slug: "apple", version: 2 }, { unit: "cup" }),
		);

		expect(error).toBeInstanceOf(TargetError);
	});

	test("rejects a slug that is both a food and a recipe as a problem of the target", async () => {
		const error = await failure(resolve({ slug: "both", version: 1 }));

		expect(error).toBeInstanceOf(TargetError);
		expect(error.message).toContain("'both' is both a food and a recipe");
	});

	test("rejects an invalid file as a problem of the target, keeping its problems", async () => {
		const problems = [
			{ file: "/data/foods/rice.yaml", line: 4, message: "document 1: bad" },
		];
		const broken = {
			...store,
			readFood: async () => {
				throw new NomnomError("/data/foods/rice.yaml is invalid", problems);
			},
		};

		const error = await failure(
			resolveReference(
				{ catalog: createCatalog({ store: broken }), config: defaultConfig },
				{ slug: "rice", version: 1 },
			),
		);

		expect(error).toBeInstanceOf(TargetError);
		expect(error.message).toBe("/data/foods/rice.yaml is invalid");
		expect(error.problems).toEqual(problems);
	});
});
