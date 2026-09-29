import { describe, expect, test } from "bun:test";
import { createCatalog } from "../catalog/catalog";
import { createFixedClock } from "../clock/__mocks__/clock";
import { createStaticConfigService } from "../config/__mocks__/config-service";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import {
	createFakeStore,
	food,
	recipe,
} from "../store/__mocks__/versioned-store";
import { createDayLogService, type LogInput } from "./daylog-service";

const day = "/data/logs/2026/2026-09-29.nom";

function setup(files: Record<string, string> = {}) {
	const fs = createMemoryFileSystem(files);
	const writes: string[] = [];
	const store = createFakeStore({
		foods: {
			apple: [
				food({ units: { "small sized apple": 134 } }),
				food({ version: 2, units: { "medium sized apple": 180 } }),
			],
			pear: [food(), food({ version: 2, archived: true })],
			rice: [
				food({ nutrients: { kcal: 360 } }),
				food({ version: 2, nutrients: { kcal: 360, protien: 7 } }),
			],
		},
		recipes: {
			batter: [recipe({ servings: 2, ingredients: [] })],
		},
	});
	const service = createDayLogService({
		fs: {
			...fs,
			createExclusive: async (path) => {
				throw new Error(`day files are never created exclusively: ${path}`);
			},
			replaceAtomic: async (path, text) => {
				writes.push(path);
				await fs.replaceAtomic(path, text);
			},
		},
		// Local noon on 2026-09-29, whatever the time zone.
		clock: createFixedClock(new Date(2026, 8, 29, 12, 0)),
		paths: dataPaths("/data"),
		config: createStaticConfigService(),
		catalog: createCatalog({ store }),
	});
	const log = (input: Partial<LogInput>) =>
		service.log({ meal: "breakfast", ...input });
	return { fs, writes, log };
}

async function rejection(promise: Promise<unknown>): Promise<NomnomError> {
	const error: unknown = await promise.catch((e) => e);
	expect(error).toBeInstanceOf(NomnomError);
	return error as NomnomError;
}

describe("log a reference", () => {
	test("pins the latest version and writes the day file", async () => {
		const { fs, writes, log } = setup();

		const logged = await log({
			ref: "apple",
			amount: "1",
			unit: "medium sized apple",
			date: "2026-09-29",
		});

		expect(logged).toEqual({
			path: day,
			date: "2026-09-29",
			line: "apple@2 1 medium sized apple",
			warnings: [],
		});
		expect(fs.files.get(day)).toBe(
			"[breakfast]\napple@2 1 medium sized apple\n",
		);
		expect(writes).toEqual([day]);
	});

	test("defaults the date to today's local date", async () => {
		const { log } = setup();

		expect((await log({ ref: "apple", amount: "1" })).date).toBe("2026-09-29");
	});

	test("keeps an explicit version and writes the default unit", async () => {
		const { log } = setup();

		expect((await log({ ref: "apple@1", amount: "150" })).line).toBe(
			"apple@1 150 g",
		);
		expect((await log({ ref: "batter", amount: "0.5" })).line).toBe(
			"batter@1 0.5 serving",
		);
	});

	test("normalises the unit words", async () => {
		const { log } = setup();

		expect(
			(await log({ ref: "apple", amount: "1", unit: " medium  sized apple" }))
				.line,
		).toBe("apple@2 1 medium sized apple");
	});

	test.each([
		[
			"a meal that is not configured",
			{ meal: "brunch", ref: "apple", amount: "1" },
			"'brunch' is not a configured meal; the meals are breakfast, lunch, dinner, snack",
		],
		["an archived item", { ref: "pear", amount: "1" }, "'pear' is archived"],
		[
			"an unknown item",
			{ ref: "unicorn", amount: "1" },
			"'unicorn' is neither a food nor a recipe",
		],
		[
			"a version that does not exist",
			{ ref: "apple@3", amount: "1" },
			"'apple@3' does not exist",
		],
		[
			"a unit that is not allowed",
			{ ref: "apple", amount: "1", unit: "cup" },
			"'cup' is not a unit of apple@2",
		],
		[
			"an unusable food version",
			{ ref: "rice@2", amount: "80" },
			"'rice@2' is unusable: 'protien' is not a nutrient in config.yaml",
		],
		[
			"a zero amount",
			{ ref: "apple", amount: "0" },
			"The amount must be a positive number",
		],
		[
			"a missing amount",
			{ ref: "apple" },
			"Give a food or recipe and an amount",
		],
		["nothing to log", {}, "Give a food or recipe and an amount"],
		[
			"nutrient values without --inline",
			{ ref: "apple", amount: "1", nutrients: { kcal: "5" } },
			"only given with --inline",
		],
		[
			"an invalid date",
			{ ref: "apple", amount: "1", date: "2026-02-30" },
			"must be a real date",
		],
	])("rejects %s without writing", async (_name, input, message) => {
		const { fs, log } = setup();

		const error = await rejection(log(input));

		expect(error.message).toContain(message);
		expect(fs.files.size).toBe(0);
	});
});

describe("log an inline entry", () => {
	test("writes the nutrients in catalog order", async () => {
		const { fs, log } = setup();

		const logged = await log({
			meal: "dinner",
			inline: "restaurant ramen",
			nutrients: { protein: "35", kcal: "800" },
		});

		expect(logged.line).toBe('"restaurant ramen" kcal=800 protein=35');
		expect(fs.files.get(day)).toBe(
			'[dinner]\n"restaurant ramen" kcal=800 protein=35\n',
		);
	});

	test.each([
		["a missing required nutrient", { nutrients: { protein: "35" } }, "'kcal'"],
		["no nutrient values", { nutrients: {} }, "Missing required nutrient"],
		["a negative value", { nutrients: { kcal: "-1" } }, "must not be negative"],
		[
			"a quote in the description",
			{ inline: 'the "best" ramen' },
			"can't contain '\"'",
		],
		["an empty description", { inline: "  " }, "must not be empty"],
		["a reference as well", { ref: "apple", amount: "1" }, "not both"],
	])("rejects %s", async (_name, input, message) => {
		const { log } = setup();

		const error = await rejection(
			log({ inline: "ramen", nutrients: { kcal: "800" }, ...input }),
		);

		expect(error.message).toContain(message);
	});
});

describe("existing day files", () => {
	test("adds to an existing file without changing other lines", async () => {
		const original = "[breakfast]\napple@1 150      # with honey\n\n[lunch]\n";
		const { fs, log } = setup({ [day]: original });

		await log({ ref: "apple", amount: "1" });

		expect(fs.files.get(day)).toBe(
			"[breakfast]\napple@1 150      # with honey\napple@2 1 g\n\n[lunch]\n",
		);
	});

	test("refuses to write when the file has errors, reporting their lines", async () => {
		const original = "[breakfast]\napple 1\n\n[lunch]\nunicorn@1 1\n";
		const { fs, writes, log } = setup({ [day]: original });

		const error = await rejection(log({ ref: "apple", amount: "1" }));

		expect(error.message).toBe(
			`${day} has errors; fix them before logging to this day`,
		);
		expect(error.problems.map((p) => [p.file, p.line])).toEqual([
			[day, 2],
			[day, 5],
		]);
		expect(fs.files.get(day)).toBe(original);
		expect(writes).toEqual([]);
	});

	test("returns warnings about the file and still logs", async () => {
		const { fs, log } = setup({ [day]: "[brunch]\napple@1 1\n" });

		const logged = await log({ ref: "apple", amount: "1" });

		expect(logged.warnings).toEqual([
			{ file: day, line: 1, message: expect.stringContaining("'brunch'") },
		]);
		expect(fs.files.get(day)).toBe(
			"[breakfast]\napple@2 1 g\n\n[brunch]\napple@1 1\n",
		);
	});
});
