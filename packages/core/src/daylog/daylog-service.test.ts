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
import { readDay } from "./read-day";

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
			oats: [food(), food({ version: 2 })],
			milk: [food({ baseUnit: "ml" })],
			coffee: [food({ units: { cup: 240 } })],
			"7up": [food({ baseUnit: "ml", units: { can: 330 } })],
		},
		recipes: {
			batter: [recipe({ servings: 2, ingredients: [] })],
		},
	});
	// Local noon on 2026-09-29, whatever the time zone.
	const clock = createFixedClock(new Date(2026, 8, 29, 12, 0));
	const paths = dataPaths("/data");
	const config = createStaticConfigService();
	const catalog = createCatalog({ store });
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
		clock,
		paths,
		config,
		catalog,
	});
	const log = (input: Partial<LogInput>) =>
		service.log({ meal: "breakfast", ...input });
	/** The day file checked by the rules of `check`. */
	const readBack = async (date: string) =>
		readDay({ fs, paths, catalog }, await config.load(), date);
	return { fs, writes, log, clock, readBack };
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
			lines: ["apple@2 1 medium sized apple"],
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

		expect((await log({ ref: "apple@1", amount: "150" })).lines).toEqual([
			"apple@1 150 g",
		]);
		expect((await log({ ref: "batter", amount: "0.5" })).lines).toEqual([
			"batter@1 0.5 serving",
		]);
	});

	test("normalises the unit words", async () => {
		const { log } = setup();

		expect(
			(await log({ ref: "apple", amount: "1", unit: " medium  sized apple" }))
				.lines,
		).toEqual(["apple@2 1 medium sized apple"]);
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
			"'cup' is not a unit of apple@2; it allows 'g', 'medium sized apple'",
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

		expect(logged.lines).toEqual(['"restaurant ramen" kcal=800 protein=35']);
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

describe("log --entry values", () => {
	test("writes references and inline entries in order, in the standard form", async () => {
		const { fs, writes, log } = setup({
			[day]: "[breakfast]\napple@1   150   # before the run\n\n[lunch]\n",
		});

		const logged = await log({
			entries: [
				"apple 1 medium  sized apple",
				"  rice@1   80  ",
				'"hotel coffee"   kcal=5',
				"batter 1",
			],
		});

		const lines = [
			"apple@2 1 medium sized apple",
			"rice@1 80 g",
			'"hotel coffee" kcal=5',
			"batter@1 1 serving",
		];
		expect(logged).toEqual({
			path: day,
			date: "2026-09-29",
			lines,
			warnings: [],
		});
		expect(fs.files.get(day)).toBe(
			[
				"[breakfast]",
				"apple@1   150   # before the run",
				...lines,
				"",
				"[lunch]",
				"",
			].join("\n"),
		);
		expect(writes).toEqual([day]);
	});

	test("writes inline nutrients in catalog order", async () => {
		const { log } = setup();

		const logged = await log({ entries: ['"ramen"   protein=35 kcal=800'] });

		expect(logged.lines).toEqual(['"ramen" kcal=800 protein=35']);
	});

	test("gives each entry of the same item its own line", async () => {
		const { fs, log } = setup();

		await log({ entries: ["apple 1", "apple 1"] });

		expect(fs.files.get(day)).toBe("[breakfast]\napple@2 1 g\napple@2 1 g\n");
	});

	test("reports every invalid entry by position and text, and writes nothing", async () => {
		const original = "[breakfast]\napple@1 150\n";
		const { fs, writes, log } = setup({ [day]: original });
		const before = new Map(fs.files);

		const error = await rejection(
			log({ entries: ["apple 1", " apple 1 cup ", "unicorn 1"] }),
		);

		expect(error.message).toBe("Can't log 2 of 3 entries");
		expect(error.problems).toEqual([
			{
				file: "",
				message:
					"entry 2 'apple 1 cup': 'cup' is not a unit of apple@2; it allows 'g', 'medium sized apple'",
			},
			{
				file: "",
				message:
					"entry 3 'unicorn 1': 'unicorn' is neither a food nor a recipe",
			},
		]);
		expect(fs.files).toEqual(before);
		expect(writes).toEqual([]);
	});

	test.each([
		[
			"an archived item",
			"pear 1",
			"entry 1 'pear 1': 'pear' is archived and can't be newly referenced",
		],
		[
			"an unusable food version",
			"rice@2 80",
			"entry 1 'rice@2 80': 'rice@2' is unusable: 'protien' is not a nutrient in config.yaml",
		],
		[
			"an unknown nutrient in an inline entry",
			'"x" kcal=1 weight=3',
			`entry 1 '"x" kcal=1 weight=3': 'weight' is not a nutrient in config.yaml`,
		],
		[
			"a missing required nutrient",
			'"x" protein=3',
			`entry 1 '"x" protein=3': the required nutrient 'kcal' is missing`,
		],
		[
			"a comment",
			"apple 1  # at work",
			"entry 1 'apple 1  # at work': entries can't contain comments ('#'); add comments to the day file by hand",
		],
		[
			"a section header",
			"[lunch]",
			`entry 1 '[lunch]': expected an entry such as 'apple 1' or '"ramen" kcal=800'`,
		],
	])("rejects %s at the entry", async (_name, entry, message) => {
		const { fs, log } = setup();

		const error = await rejection(log({ entries: [entry] }));

		expect(error.message).toBe("Can't log the entry");
		expect(error.problems).toEqual([{ file: "", message }]);
		expect(fs.files.size).toBe(0);
	});

	test.each([
		["a food", { ref: "apple" }],
		["an amount", { amount: "1" }],
		["a unit", { unit: "g" }],
		["--inline", { inline: "tea" }],
		["a nutrient value", { nutrients: { kcal: "2" } }],
	])("can't be combined with %s", async (_name, input) => {
		const { fs, log } = setup();

		const error = await rejection(log({ entries: ["apple 1"], ...input }));

		expect(error.message).toBe(
			"Give --entry values, or one entry as a food or recipe with an amount or with --inline, not both",
		);
		expect(fs.files.size).toBe(0);
	});

	test("ignores nutrient options that were not given", async () => {
		const { log } = setup();

		const logged = await log({
			entries: ["apple 1"],
			nutrients: { kcal: undefined },
		});

		expect(logged.lines).toEqual(["apple@2 1 g"]);
	});

	test("refuses to write when the file has errors", async () => {
		const original = "[breakfast]\napple 1\n";
		const { fs, writes, log } = setup({ [day]: original });

		const error = await rejection(log({ entries: ["apple 1", "apple@1 80"] }));

		expect(error.message).toBe(
			`${day} has errors; fix them before logging to this day`,
		);
		expect(fs.files.get(day)).toBe(original);
		expect(writes).toEqual([]);
	});

	test("returns warnings about the file and still logs", async () => {
		const { fs, log } = setup({ [day]: "[brunch]\napple@1 1\n" });

		const logged = await log({ entries: ["apple 1", "apple@1 80"] });

		expect(logged.warnings).toEqual([
			{ file: day, line: 1, message: expect.stringContaining("'brunch'") },
		]);
		expect(fs.files.get(day)).toBe(
			"[breakfast]\napple@2 1 g\napple@1 80 g\n\n[brunch]\napple@1 1\n",
		);
	});
});

describe("log with a time", () => {
	test("--time with the positional form writes and returns the timed line", async () => {
		const { fs, log } = setup();

		const logged = await log({
			ref: "apple",
			amount: "1",
			unit: "medium sized apple",
			time: "08:15",
			date: "2026-09-29",
		});

		expect(logged.lines).toEqual(["08:15 apple@2 1 medium sized apple"]);
		expect(fs.files.get(day)).toBe(
			"[breakfast]\n08:15 apple@2 1 medium sized apple\n",
		);
	});

	test("--time with --inline writes the timed inline line", async () => {
		const { fs, log } = setup();

		const logged = await log({
			meal: "dinner",
			inline: "restaurant ramen",
			nutrients: { kcal: "800", protein: "35" },
			time: "19:30",
		});

		expect(logged.lines).toEqual([
			'19:30 "restaurant ramen" kcal=800 protein=35',
		]);
		expect(fs.files.get(day)).toBe(
			'[dinner]\n19:30 "restaurant ramen" kcal=800 protein=35\n',
		);
	});

	test("keeps a time-like --inline description as text, without a time", async () => {
		const { fs, log } = setup();

		const logged = await log({
			meal: "lunch",
			inline: "12:30 ramen",
			nutrients: { kcal: "800" },
		});

		expect(logged.lines).toEqual(['"12:30 ramen" kcal=800']);
		expect(fs.files.get(day)).toBe('[lunch]\n"12:30 ramen" kcal=800\n');
	});

	test("--time with --entry values prefixes every line", async () => {
		const { fs, log } = setup();

		const logged = await log({
			time: "07:45",
			entries: ["oats 60 g", "milk 200 ml"],
		});

		expect(logged.lines).toEqual(["07:45 oats@2 60 g", "07:45 milk@1 200 ml"]);
		expect(fs.files.get(day)).toBe(
			"[breakfast]\n07:45 oats@2 60 g\n07:45 milk@1 200 ml\n",
		);
	});

	test("writes a mixed batch of timed and untimed entries in order", async () => {
		const { fs, log } = setup();

		const logged = await log({
			entries: [
				"07:30 oats 60 g",
				"milk 200 ml",
				'08:10 "hotel coffee" kcal=5',
			],
		});

		const lines = [
			"07:30 oats@2 60 g",
			"milk@1 200 ml",
			'08:10 "hotel coffee" kcal=5',
		];
		expect(logged.lines).toEqual(lines);
		expect(fs.files.get(day)).toBe(`[breakfast]\n${lines.join("\n")}\n`);
	});

	test("writes a timed --entry value in the standard form", async () => {
		const { log } = setup();

		const logged = await log({
			entries: ["  08:15    apple   1 medium sized apple "],
		});

		expect(logged.lines).toEqual(["08:15 apple@2 1 medium sized apple"]);
	});

	test("writes a slug starting with digits without a time", async () => {
		const { log } = setup();

		expect((await log({ entries: ["7up 1 can"] })).lines).toEqual([
			"7up@1 1 can",
		]);
	});
});

describe("log with a rejected time", () => {
	test.each(["8:15", "24:00", "12:60"])(
		"rejects --time %s at once, naming the value",
		async (time) => {
			const { fs, writes, log } = setup();

			const error = await rejection(
				log({ time, entries: ["oats 60 g", "unicorn 1", "milk 200 ml"] }),
			);

			expect(error.message).toBe(
				`The time must be HH:MM, from 00:00 to 23:59, got '${time}'`,
			);
			expect(error.problems).toEqual([]);
			expect(fs.files.size).toBe(0);
			expect(writes).toEqual([]);
		},
	);

	test.each([
		["08:15", {}],
		["8:15", {}],
		["08:15", { time: "08:15" }],
		["08:15", { inline: "tea", nutrients: { kcal: "2" } }],
		["8:15", { entries: ["oats 60 g"] }],
		["08:15", { amount: "1", unit: "g", date: "2026-09-29" }],
	])("rejects the positional word %s with %p", async (ref, input) => {
		const { fs, writes, log } = setup();

		const error = await rejection(
			log({ ref, amount: "1", ...(input as Partial<LogInput>) }),
		);

		expect(error.message).toBe(
			"Give the time with --time, as in 'nomnom log breakfast apple 1 --time 08:15'",
		);
		expect(fs.files.size).toBe(0);
		expect(writes).toEqual([]);
	});

	test("reports conflicting times with the other invalid entries", async () => {
		const original = "[breakfast]\napple@1 150\n";
		const { fs, writes, log } = setup({ [day]: original });
		const before = new Map(fs.files);

		const error = await rejection(
			log({
				time: "08:00",
				entries: [
					"07:30 oats 60 g",
					"milk 200 ml",
					"08:00 coffee 1 cup",
					"apple 40 cup",
				],
			}),
		);

		expect(error.message).toBe("Can't log 3 of 4 entries");
		expect(error.problems).toEqual([
			{
				file: "",
				message:
					"entry 1 '07:30 oats 60 g': it has its own time 07:30, which conflicts with --time 08:00",
			},
			{
				file: "",
				message:
					"entry 3 '08:00 coffee 1 cup': it has its own time 08:00, which conflicts with --time 08:00",
			},
			{
				file: "",
				message:
					"entry 4 'apple 40 cup': 'cup' is not a unit of apple@2; it allows 'g', 'medium sized apple'",
			},
		]);
		expect(fs.files).toEqual(before);
		expect(writes).toEqual([]);
	});

	test("lists a conflict first, then the value's other problems", async () => {
		const { fs, log } = setup();

		const error = await rejection(
			log({ time: "08:00", entries: ["07:30 apple 1 cup"] }),
		);

		expect(error.message).toBe("Can't log the entry");
		expect(error.problems).toEqual([
			{
				file: "",
				message:
					"entry 1 '07:30 apple 1 cup': it has its own time 07:30, which conflicts with --time 08:00",
			},
			{
				file: "",
				message:
					"entry 1 '07:30 apple 1 cup': 'cup' is not a unit of apple@2; it allows 'g', 'medium sized apple'",
			},
		]);
		expect(fs.files.size).toBe(0);
	});

	test("lists a conflict first, then an unknown item of the value", async () => {
		const { log } = setup();

		const error = await rejection(
			log({ time: "08:00", entries: ["07:30 unicorn 1"] }),
		);

		expect(error.problems.map((p) => p.message)).toEqual([
			"entry 1 '07:30 unicorn 1': it has its own time 07:30, which conflicts with --time 08:00",
			"entry 1 '07:30 unicorn 1': 'unicorn' is neither a food nor a recipe",
		]);
	});

	test.each([
		[
			"8:15 milk 200 ml",
			"entry 2 '8:15 milk 200 ml': '8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
		],
		["08:15", "entry 2 '08:15': the time '08:15' needs an entry after it"],
	])("rejects the --entry value %p", async (entry, message) => {
		const { fs, writes, log } = setup();

		const error = await rejection(log({ entries: ["oats 60 g", entry] }));

		expect(error.message).toBe("Can't log 1 of 2 entries");
		expect(error.problems).toEqual([{ file: "", message }]);
		expect(fs.files.size).toBe(0);
		expect(writes).toEqual([]);
	});
});

describe("log times, the clock and dates", () => {
	test.each([
		["today at 08:15", undefined],
		["a backdated date", "2026-09-20"],
		["a future date", "2026-10-02"],
	])("writes an untimed line for %s", async (_name, date) => {
		const { fs, clock, log } = setup();
		clock.set(new Date(2026, 8, 29, 8, 15));

		const logged = await log({
			ref: "apple",
			amount: "1",
			...(date === undefined ? {} : { date }),
		});

		expect(logged.lines).toEqual(["apple@2 1 g"]);
		expect(fs.files.get(logged.path)).toBe("[breakfast]\napple@2 1 g\n");
	});

	test("writes a time skipped by a DST change as given", async () => {
		const { fs, log, readBack } = setup();

		const logged = await log({
			ref: "apple",
			amount: "1",
			date: "2026-03-29",
			time: "02:30",
		});

		expect(logged.path).toBe("/data/logs/2026/2026-03-29.nom");
		expect(fs.files.get(logged.path)).toBe("[breakfast]\n02:30 apple@2 1 g\n");
		expect((await readBack("2026-03-29")).check.errors).toEqual([]);
	});

	test("accepts a time later than now on today's date", async () => {
		const { fs, log } = setup();

		const logged = await log({ ref: "apple", amount: "1", time: "23:59" });

		expect(logged.date).toBe("2026-09-29");
		expect(fs.files.get(day)).toBe("[breakfast]\n23:59 apple@2 1 g\n");
	});

	test("inserts an earlier time after a later one, moving no line", async () => {
		const original = [
			"[breakfast]",
			"09:00 coffee@1 1 cup",
			"",
			"[lunch]",
			"milk@1   250 ml   # after work",
			'12:30   "soup"  kcal=90',
			"",
		].join("\n");
		const { fs, log, readBack } = setup({ [day]: original });

		const logged = await log({
			ref: "oats",
			amount: "60",
			unit: "g",
			time: "07:30",
		});

		expect(logged.lines).toEqual(["07:30 oats@2 60 g"]);
		expect(fs.files.get(day)).toBe(
			[
				"[breakfast]",
				"09:00 coffee@1 1 cup",
				"07:30 oats@2 60 g",
				"",
				"[lunch]",
				"milk@1   250 ml   # after work",
				'12:30   "soup"  kcal=90',
				"",
			].join("\n"),
		);
		expect((await readBack("2026-09-29")).check.errors).toEqual([]);
	});

	test("every written timed line is accepted by the rules of check", async () => {
		const { log, readBack } = setup();

		await log({ ref: "apple", amount: "1", time: "00:00" });
		await log({
			meal: "dinner",
			inline: "tea",
			nutrients: { kcal: "2" },
			time: "23:59",
		});
		await log({
			meal: "snack",
			time: "16:00",
			entries: ["7up 1 can", '"cookie" kcal=120'],
		});
		await log({ meal: "lunch", entries: ["12:30 oats 60 g", "milk 200"] });

		const { lines, check } = await readBack("2026-09-29");
		expect(check.errors).toEqual([]);
		expect(lines.map((l) => l.raw)).toEqual([
			"[breakfast]",
			"00:00 apple@2 1 g",
			"",
			"[lunch]",
			"12:30 oats@2 60 g",
			"milk@1 200 ml",
			"",
			"[dinner]",
			'23:59 "tea" kcal=2',
			"",
			"[snack]",
			"16:00 7up@1 1 can",
			'16:00 "cookie" kcal=120',
		]);
	});
});
