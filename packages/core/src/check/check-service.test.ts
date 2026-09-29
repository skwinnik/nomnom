import { describe, expect, test } from "bun:test";
import { createFixedClock } from "../clock/__mocks__/clock";
import { DEFAULT_CONFIG_TEXT } from "../config/config";
import { createConfigService } from "../config/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { food, recipe } from "../store/__mocks__/versioned-store";
import type {
	FoodVersion,
	Ingredient,
	ItemKind,
	RecipeVersion,
} from "../store/records";
import { createVersionedStore } from "../store/versioned-store";
import { serialiseFood, serialiseRecipe } from "../store/write";
import { createCheckService } from "./check-service";

const paths = dataPaths("/data");
const dayPath = (date: string) => paths.day(date);

interface Data {
	foods?: Record<string, FoodVersion[]>;
	recipes?: Record<string, RecipeVersion[]>;
	/** Day files by date. */
	days?: Record<string, string>;
	/** Other files by path. */
	files?: Record<string, string>;
}

function setup(data: Data = {}) {
	const files: Record<string, string> = {
		[paths.config]: DEFAULT_CONFIG_TEXT,
		...data.files,
	};
	for (const [slug, versions] of Object.entries(data.foods ?? {})) {
		files[paths.food(slug)] = versions.map(serialiseFood).join("");
	}
	for (const [slug, versions] of Object.entries(data.recipes ?? {})) {
		files[paths.recipe(slug)] = versions.map(serialiseRecipe).join("");
	}
	for (const [date, text] of Object.entries(data.days ?? {})) {
		files[dayPath(date)] = text;
	}
	const fs = createMemoryFileSystem(files);
	const service = createCheckService({
		fs,
		paths,
		config: createConfigService({ fs, paths }),
		store: createVersionedStore({
			fs,
			clock: createFixedClock(new Date("2026-09-29T17:10:00Z")),
			paths,
		}),
	});
	return { fs, files, check: () => service.check() };
}

async function check(data: Data = {}) {
	return setup(data).check();
}

/** Every error as `<file>[:<line>]: <message>`, with the data directory left out. */
async function errorsOf(data: Data): Promise<string[]> {
	const { errors } = await check(data);
	return errors.map(
		({ file, line, message }) =>
			`${file.replace("/data/", "")}${line === undefined ? "" : `:${line}`}: ${message}`,
	);
}

function pin(
	ref: string,
	amount = 1,
	unit = "g",
	kind: ItemKind = "food",
): Ingredient {
	const [slug = "", version = "1"] = ref.split("@");
	return { kind, slug, version: Number(version), amount, unit };
}

const rice = [food({ name: "Rice", nutrients: { kcal: 360 } })];

describe("clean data", () => {
	test("finds no problems and counts the files", async () => {
		const result = await check({
			foods: { rice },
			recipes: { bowl: [recipe({ ingredients: [pin("rice@1", 80)] })] },
			days: {
				"2026-09-28": "[lunch]\nrice@1 80\nbowl@1 1 serving\n",
				"2026-09-29": '[dinner]\n"ramen" kcal=800\n',
			},
		});

		expect(result).toEqual({
			errors: [],
			warnings: [],
			checked: { foods: 1, recipes: 1, days: 2 },
		});
	});

	test("an empty data directory has nothing to check", async () => {
		expect((await check()).checked).toEqual({ foods: 0, recipes: 0, days: 0 });
	});

	test("changes no file", async () => {
		const { fs, files, check } = setup({
			foods: { rice, "My Rice": rice },
			days: { "2026-09-28": "[lunch]\nrice 80\n" },
		});

		await check();

		expect(Object.fromEntries(fs.files)).toEqual(files);
	});
});

describe("config.yaml", () => {
	test("an invalid config fails with only its problems", async () => {
		const { check } = setup({
			files: {
				[paths.config]: "nutrients: [\n",
				[paths.food("rice")]: "version: [\n",
			},
		});

		const error = await check().catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.problems.length).toBeGreaterThan(0);
		for (const problem of error.problems) {
			expect(problem.file).toBe(paths.config);
		}
	});
});

describe("food and recipe files", () => {
	test("reports every problem of two broken food files", async () => {
		const errors = await errorsOf({
			foods: { rice },
			files: {
				[paths.food("apple")]: "---\nversion: 1\nper: x\n",
				[paths.food("pear")]: "---\nversion: [\n",
			},
		});

		expect(errors.length).toBeGreaterThan(2);
		expect(errors.some((error) => error.startsWith("foods/apple.yaml:"))).toBe(
			true,
		);
		expect(errors.some((error) => error.startsWith("foods/pear.yaml:"))).toBe(
			true,
		);
		expect(errors.filter((error) => error.startsWith("foods/rice"))).toEqual(
			[],
		);
	});

	test("reports a broken recipe file", async () => {
		const errors = await errorsOf({
			files: { [paths.recipe("soup")]: "---\nversion: 2\n" },
		});

		expect(errors[0]).toStartWith("recipes/soup.yaml:");
	});

	test("reports an invalid file name", async () => {
		expect(await errorsOf({ foods: { "My Rice": rice } })).toEqual([
			"foods/My Rice.yaml: 'My Rice' is not a valid file name: use letters, digits and '-'",
		]);
	});

	test("reports a slug in both directories once, at the food file", async () => {
		expect(
			await errorsOf({
				foods: { rice, pancakes: rice },
				recipes: {
					pancakes: [recipe({ ingredients: [pin("rice@1")] })],
					bowl: [
						recipe({
							ingredients: [pin("pancakes@1", 1, "serving", "recipe")],
						}),
					],
				},
				days: { "2026-09-28": "[lunch]\npancakes@1 1\n" },
			}),
		).toEqual([
			"foods/pancakes.yaml: 'pancakes' is both a food and a recipe: rename one of the files in foods/ and recipes/",
		]);
	});

	test("reports unusable old and archived versions, naming each version", async () => {
		expect(
			await errorsOf({
				foods: {
					apple: [
						food({ nutrients: { protein: 0.3 } }),
						food({ version: 2, nutrients: { kcal: 52 } }),
					],
					pear: [
						food({ nutrients: { kcal: 57 } }),
						food({
							version: 2,
							nutrients: { kcal: 57, protien: 1 },
							archived: true,
						}),
					],
				},
			}),
		).toEqual([
			"foods/apple.yaml: version 1: the required nutrient 'kcal' is missing",
			"foods/pear.yaml: version 2: 'protien' is not a nutrient in config.yaml",
		]);
	});
});

describe("barcodes", () => {
	test("reports a barcode shared in different forms once, at the first food", async () => {
		expect(
			await errorsOf({
				foods: {
					"cola-2": [
						food({ barcodes: ["04601234567890"] }),
						food({ version: 2, barcodes: ["04601234567890"] }),
					],
					"cola-1": [food({ barcodes: ["4601234567890"] })],
					"cola-3": [food({ barcodes: ["4601234567890", "12345"] })],
				},
			}),
		).toEqual([
			"foods/cola-1.yaml: the barcode '4601234567890' (normalized: 4601234567890) also belongs to cola-2@2, cola-3@1",
		]);
	});

	test("ignores archived foods and earlier versions", async () => {
		expect(
			await errorsOf({
				foods: {
					"cola-1": [food({ barcodes: ["4601234567890"] })],
					"cola-2": [
						food({ barcodes: ["4601234567890"] }),
						food({ version: 2, barcodes: ["4601234567890"], archived: true }),
					],
					"cola-3": [
						food({ barcodes: ["4601234567890"] }),
						food({ version: 2, barcodes: [] }),
					],
				},
			}),
		).toEqual([]);
	});
});

describe("recipe ingredients", () => {
	const carrot = [
		food({ nutrients: { kcal: 41 } }),
		food({ version: 2, nutrients: { kcal: 40 } }),
	];

	test("reports a dangling ingredient in an old version", async () => {
		expect(
			await errorsOf({
				foods: { carrot },
				recipes: {
					soup: [
						recipe({ ingredients: [pin("carrot@1"), pin("carrot@7")] }),
						recipe({ version: 2, ingredients: [pin("carrot@2")] }),
					],
				},
			}),
		).toEqual([
			"recipes/soup.yaml: version 1, ingredient 2 (carrot@7): 'carrot@7' does not exist: food 'carrot' has versions 1 to 2",
		]);
	});

	test("reports an ingredient of the wrong kind and a unit the version doesn't allow", async () => {
		expect(
			await errorsOf({
				foods: { carrot },
				recipes: {
					stock: [recipe({ ingredients: [pin("carrot@1")] })],
					soup: [
						recipe({
							ingredients: [
								pin("stock@1", 1, "serving", "food"),
								pin("carrot@1", 1, "cup"),
							],
						}),
					],
				},
			}),
		).toEqual([
			"recipes/soup.yaml: version 1, ingredient 1 (stock@1): 'stock' is a recipe, not a food",
			"recipes/soup.yaml: version 1, ingredient 2 (carrot@1): 'cup' is not a unit of carrot@1; it allows 'g'",
		]);
	});

	test("an ingredient pinning an unusable food is reported only at the food", async () => {
		expect(
			await errorsOf({
				foods: { apple: [food({ nutrients: { protein: 1 } })] },
				recipes: { pie: [recipe({ ingredients: [pin("apple@1", 100)] })] },
			}),
		).toEqual([
			"foods/apple.yaml: version 1: the required nutrient 'kcal' is missing",
		]);
	});

	test("an ingredient pinning an invalid file is reported only at the file", async () => {
		const errors = await errorsOf({
			recipes: { pie: [recipe({ ingredients: [pin("apple@1", 100)] })] },
			files: { [paths.food("apple")]: "---\nversion: [\n" },
		});

		expect(errors.every((error) => error.startsWith("foods/apple.yaml"))).toBe(
			true,
		);
	});

	test("reports a cycle once, at its first version, and nothing for a recipe containing it", async () => {
		const serving = (ref: string) => pin(ref, 1, "serving", "recipe");
		expect(
			await errorsOf({
				recipes: {
					b: [recipe({ ingredients: [serving("a@1")] })],
					a: [recipe({ ingredients: [serving("b@1")] })],
					soup: [recipe({ ingredients: [serving("a@1")] })],
				},
				days: { "2026-09-28": "[lunch]\nsoup@1 1\n" },
			}),
		).toEqual([
			"recipes/a.yaml: version 1: recipes reference each other in a cycle: a@1, b@1",
		]);
	});
});

describe("day files", () => {
	test("reports a bad line in an old day", async () => {
		expect(
			await errorsOf({
				foods: { rice },
				days: {
					"2025-03-02": "[lunch]\nrice@1 80\n\n# note\nrice 80\n",
					"2026-09-28": "[lunch]\nrice@1 80\n",
				},
			}),
		).toEqual([
			"logs/2025/2025-03-02.nom:5: 'rice' needs a version: write it as rice@<version>, as in apple@2",
		]);
	});

	test("reports a wrong unit on lines in two days", async () => {
		expect(
			await errorsOf({
				foods: { rice },
				days: {
					"2026-09-28": "[lunch]\nrice@1 1 cup\n",
					"2026-09-29": "[dinner]\nrice@1 80\nrice@1 1 cup\n",
				},
			}),
		).toEqual([
			"logs/2026/2026-09-28.nom:2: 'cup' is not a unit of rice@1; it allows 'g'",
			"logs/2026/2026-09-29.nom:3: 'cup' is not a unit of rice@1; it allows 'g'",
		]);
	});

	test("lines pinning an invalid food file are not reported", async () => {
		const errors = await errorsOf({
			days: {
				"2026-09-27": "[lunch]\napple@3 1\n",
				"2026-09-28": "[lunch]\napple@3 1\napple@3 2\n",
			},
			files: { [paths.food("apple")]: "---\nversion: [\n" },
		});

		expect(errors.length).toBeGreaterThan(0);
		expect(errors.every((error) => error.startsWith("foods/apple.yaml"))).toBe(
			true,
		);
	});

	test("an unknown meal is a warning only", async () => {
		const result = await check({
			foods: { rice },
			days: { "2026-09-28": "[brunch]\nrice@1 80\n" },
		});

		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([
			{
				file: dayPath("2026-09-28"),
				line: 1,
				message:
					"'brunch' is not a meal in config.yaml; it is kept after the configured meals",
			},
		]);
	});

	test("reports a misnamed day file", async () => {
		expect(
			await errorsOf({ files: { "/data/logs/2026/2026-9-30.nom": "" } }),
		).toEqual([
			"logs/2026/2026-9-30.nom: not a day file: day files are logs/<yyyy>/<yyyy-mm-dd>.nom",
		]);
	});
});

describe("output order", () => {
	test("groups errors by file: food files by slug, recipe files by slug, then logs/ by path", async () => {
		const errors = await errorsOf({
			foods: {
				"a-b": [food({ nutrients: {} })],
				a: [
					food({ nutrients: { protien: 1 } }),
					food({ version: 2, nutrients: {} }),
				],
				"My Food": rice,
			},
			recipes: {
				soup: [recipe({ ingredients: [pin("unicorn@1")] })],
				"b-c": [recipe({ ingredients: [pin("a@9")] })],
			},
			days: {
				"2026-09-28": "[lunch]\nunicorn@1 1\n",
				"2025-01-01": "[lunch]\nrice 1\n",
			},
			files: { "/data/logs/2026-01-01.nom": "" },
		});

		expect(errors.map((error) => error.split(": ")[0])).toEqual([
			"foods/My Food.yaml",
			"foods/a.yaml",
			"foods/a.yaml",
			"foods/a.yaml",
			"foods/a-b.yaml",
			"recipes/b-c.yaml",
			"recipes/soup.yaml",
			"logs/2025/2025-01-01.nom:2",
			"logs/2026-01-01.nom",
			"logs/2026/2026-09-28.nom:2",
		]);
		expect(errors.slice(1, 4)).toEqual([
			"foods/a.yaml: version 1: 'protien' is not a nutrient in config.yaml",
			"foods/a.yaml: version 1: the required nutrient 'kcal' is missing",
			"foods/a.yaml: version 2: the required nutrient 'kcal' is missing",
		]);
	});
});
