import { describe, expect, test } from "bun:test";
import { parseDay, parseEntryText, parseLine } from "./parse";

describe("parseDay", () => {
	test("parses the example day, keeping raw text and line numbers", () => {
		const text = [
			"[breakfast]",
			"greek-yogurt-2-460123@1  150 g",
			"apple@2                  1 medium sized apple",
			"",
			"[dinner]",
			'"restaurant ramen"       kcal=800 protein=35',
			"",
		].join("\n");

		const lines = parseDay(text);

		expect(lines.map((line) => [line.number, line.raw, line.content])).toEqual([
			[1, "[breakfast]", { kind: "section", meal: "breakfast" }],
			[
				2,
				"greek-yogurt-2-460123@1  150 g",
				{
					kind: "reference",
					slug: "greek-yogurt-2-460123",
					version: 1,
					amount: 150,
					unit: "g",
				},
			],
			[
				3,
				"apple@2                  1 medium sized apple",
				{
					kind: "reference",
					slug: "apple",
					version: 2,
					amount: 1,
					unit: "medium sized apple",
				},
			],
			[4, "", { kind: "blank" }],
			[5, "[dinner]", { kind: "section", meal: "dinner" }],
			[
				6,
				'"restaurant ramen"       kcal=800 protein=35',
				{
					kind: "inline",
					description: "restaurant ramen",
					values: [
						{ id: "kcal", value: 800 },
						{ id: "protein", value: 35 },
					],
				},
			],
		]);
	});

	test("a final line break does not add a line, but blank lines before it count", () => {
		expect(parseDay("")).toEqual([]);
		expect(parseDay("[lunch]\n")).toHaveLength(1);
		expect(parseDay("[lunch]")).toHaveLength(1);
		expect(parseDay("[lunch]\n\n")).toHaveLength(2);
	});

	test("keeps a carriage return in the raw text but not in the content", () => {
		const [line] = parseDay("[lunch]\r\n");

		expect(line?.raw).toBe("[lunch]\r");
		expect(line?.content).toEqual({ kind: "section", meal: "lunch" });
	});

	test("parses the example day with times", () => {
		const text = [
			"[breakfast]",
			"07:45 greek-yogurt-2-460123@1  150 g",
			"apple@2                        1 medium sized apple",
			"",
			"[dinner]",
			'19:30 "restaurant ramen"       kcal=800 protein=35  # with friends',
			"",
		].join("\n");

		const lines = parseDay(text);

		expect(lines.map((line) => line.content)).toEqual([
			{ kind: "section", meal: "breakfast" },
			{
				kind: "reference",
				time: "07:45",
				slug: "greek-yogurt-2-460123",
				version: 1,
				amount: 150,
				unit: "g",
			},
			{
				kind: "reference",
				slug: "apple",
				version: 2,
				amount: 1,
				unit: "medium sized apple",
			},
			{ kind: "blank" },
			{ kind: "section", meal: "dinner" },
			{
				kind: "inline",
				time: "19:30",
				description: "restaurant ramen",
				values: [
					{ id: "kcal", value: 800 },
					{ id: "protein", value: 35 },
				],
			},
		]);
		expect(lines[2]?.content).not.toHaveProperty("time");
	});

	test("keeps timed and untimed entries in file order, whatever their times", () => {
		const lines = parseDay(
			"[breakfast]\n09:00 coffee@1 1 cup\n07:30 oats@2 60 g\nmilk@1 200 ml\n",
		);

		expect(lines.map((line) => line.content)).toEqual([
			{ kind: "section", meal: "breakfast" },
			{
				kind: "reference",
				time: "09:00",
				slug: "coffee",
				version: 1,
				amount: 1,
				unit: "cup",
			},
			{
				kind: "reference",
				time: "07:30",
				slug: "oats",
				version: 2,
				amount: 60,
				unit: "g",
			},
			{ kind: "reference", slug: "milk", version: 1, amount: 200, unit: "ml" },
		]);
		expect(lines[3]?.content).not.toHaveProperty("time");
	});

	test("keeps DST wall times as written, in file order", () => {
		const lines = parseDay(
			[
				"[snack]",
				'02:30 "bottle of milk" kcal=120',
				'02:15 "tea" kcal=2',
				'02:45 "biscuit" kcal=60',
			].join("\n"),
		);

		expect(
			lines.map((line) => line.content.kind === "inline" && line.content.time),
		).toEqual([false, "02:30", "02:15", "02:45"]);
	});

	test("keeps the raw text of timed and legacy lines byte for byte", () => {
		const raws = [
			"  [breakfast]  ",
			"\t08:15\t\tapple@2   1  medium sized apple   # x\r",
			"   apple@2\t1 medium sized apple  \r",
			' 12:30   "restaurant ramen"  kcal=800 ',
			'"lunch at 12:30"   kcal=500\r',
			"7up@1 1 can",
		];

		const lines = parseDay(`${raws.join("\n")}\n`);

		expect(lines.map((line) => line.raw)).toEqual(raws);
		expect(lines.map((line) => line.content.kind)).toEqual([
			"section",
			"reference",
			"reference",
			"inline",
			"inline",
			"reference",
		]);
	});
});

describe("parseLine", () => {
	test("ignores comments, including trailing ones", () => {
		expect(parseLine("# ate late today")).toEqual({ kind: "comment" });
		expect(parseLine("   # indented")).toEqual({ kind: "comment" });
		expect(parseLine("apple@2 1 small sized apple  # at work")).toEqual({
			kind: "reference",
			slug: "apple",
			version: 2,
			amount: 1,
			unit: "small sized apple",
		});
		expect(parseLine("[lunch] # at the office")).toEqual({
			kind: "section",
			meal: "lunch",
		});
	});

	test("keeps # inside the quoted description of an inline entry", () => {
		expect(parseLine('"combo #3 # big" kcal=900 # late')).toEqual({
			kind: "inline",
			description: "combo #3 # big",
			values: [{ id: "kcal", value: 900 }],
		});
	});

	test("a reference without a unit leaves it to the default unit", () => {
		expect(parseLine("rice@1 80")).toEqual({
			kind: "reference",
			slug: "rice",
			version: 1,
			amount: 80,
		});
	});

	test("normalises the unit like a unit name", () => {
		expect(parseLine("apple@2 1 medium \t sized  apple")).toMatchObject({
			unit: "medium sized apple",
		});
	});

	test("keeps the keys of an inline entry for validation, even unknown or repeated ones", () => {
		expect(parseLine('"x" kcal=1 kcal=2 weight=3')).toMatchObject({
			values: [
				{ id: "kcal", value: 1 },
				{ id: "kcal", value: 2 },
				{ id: "weight", value: 3 },
			],
		});
	});

	test.each([
		[
			"a reference without a version",
			"apple 1 medium sized apple",
			"needs a version",
		],
		["a reference without an amount", "apple@2", "needs an amount"],
		["a zero amount", "apple@2 0 g", "positive number"],
		["an amount that is not a number", "apple@2 one g", "positive number"],
		["a bad version", "apple@x 1", "positive whole number"],
		["a bad slug", "../apple@1 1", "not a valid food or recipe name"],
		["a unit containing #", "apple@2 1 can#2", "can't contain '#'"],
		["an unclosed section", "[lunch", "expected a section header"],
		["an invalid meal", "[Second Breakfast]", "invalid meal"],
		["an unclosed description", '"ramen kcal=800', "no closing"],
		["an empty description", '"" kcal=800', "description is empty"],
		["an inline entry without values", '"ramen"', "needs nutrient values"],
		[
			"an amount and unit instead of nutrients",
			'"ramen" 300 g',
			"expected <nutrient>=<number>",
		],
		["a negative inline value", '"ramen" kcal=-5', "non-negative"],
		[
			"a quote after the description",
			'"a" "b" kcal=1',
			"expected <nutrient>=<number>",
		],
	])("reports %s as an error line", (_name, line, message) => {
		const content = parseLine(line);

		expect(content.kind).toBe("error");
		expect(content.kind === "error" && content.message).toContain(message);
	});

	describe("times", () => {
		test("a timed reference with a multi-word unit", () => {
			expect(parseLine("08:15 apple@2 1 medium sized apple")).toEqual({
				kind: "reference",
				time: "08:15",
				slug: "apple",
				version: 2,
				amount: 1,
				unit: "medium sized apple",
			});
		});

		test("a timed reference with a slug starting with digits", () => {
			expect(parseLine("18:00 7up@1 1 can")).toEqual({
				kind: "reference",
				time: "18:00",
				slug: "7up",
				version: 1,
				amount: 1,
				unit: "can",
			});
		});

		test("a timed inline entry", () => {
			expect(parseLine('12:30 "restaurant ramen" kcal=800 protein=35')).toEqual(
				{
					kind: "inline",
					time: "12:30",
					description: "restaurant ramen",
					values: [
						{ id: "kcal", value: 800 },
						{ id: "protein", value: 35 },
					],
				},
			);
		});

		test.each([
			["a tab", "08:15\tapple@2 1"],
			["several spaces", "08:15     apple@2 1"],
			["tabs and spaces", "08:15 \t apple@2 1"],
			["a CRLF line break", "08:15 apple@2 1\r"],
		])("reads the time followed by %s", (_name, line) => {
			expect(parseLine(line)).toEqual({
				kind: "reference",
				time: "08:15",
				slug: "apple",
				version: 2,
				amount: 1,
			});
		});

		test("a time that doesn't match the meal", () => {
			expect(parseLine('23:30 "late cereal" kcal=300')).toMatchObject({
				kind: "inline",
				time: "23:30",
				description: "late cereal",
			});
		});

		test.each(["00:00", "23:59"])(
			"the start and end of the day: %s",
			(time) => {
				expect(parseLine(`${time} "midnight snack" kcal=150`)).toMatchObject({
					kind: "inline",
					time,
				});
			},
		);

		test.each([
			[
				"apple@2 1 medium sized apple",
				{
					kind: "reference",
					slug: "apple",
					version: 2,
					amount: 1,
					unit: "medium sized apple",
				},
			],
			[
				"7up@1 1 can",
				{ kind: "reference", slug: "7up", version: 1, amount: 1, unit: "can" },
			],
			[
				"123-cereal@2 40 g",
				{
					kind: "reference",
					slug: "123-cereal",
					version: 2,
					amount: 40,
					unit: "g",
				},
			],
			[
				'"lunch at 12:30" kcal=500',
				{
					kind: "inline",
					description: "lunch at 12:30",
					values: [{ id: "kcal", value: 500 }],
				},
			],
			["# 08:15 coffee", { kind: "comment" }],
			["[lunch] # 12:30", { kind: "section", meal: "lunch" }],
		])("reads %j as without times, with no time key", (line, content) => {
			const parsed = parseLine(line);

			expect(parsed).toEqual(content as typeof parsed);
			expect(parsed).not.toHaveProperty("time");
		});

		test.each([
			[
				"08:15apple@2 1 medium sized apple",
				"the time '08:15' must be followed by a space and an entry",
			],
			[
				'12:30"ramen" kcal=800',
				"the time '12:30' must be followed by a space and an entry",
			],
			...["8:15", "24:00", "12:60", "08:15:30", "8:15pm", "08:5"].map(
				(time) => [
					`${time} apple@2 1 medium sized apple`,
					`'${time}' is not a valid time: write it as HH:MM, from 00:00 to 23:59`,
				],
			),
			[
				"8:15 # coffee",
				"'8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
			],
			[
				"24:00 [lunch]",
				"'24:00' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
			],
			["08:15", "the time '08:15' needs an entry after it"],
			["08:15  # coffee", "the time '08:15' needs an entry after it"],
			[
				"08:15 [lunch]",
				"the time '08:15' needs an entry after it, not a section header",
			],
			[
				"08:15 09:00 apple@2 1",
				"a line has at most one time, got '09:00' after '08:15'",
			],
			[
				"08:15 apple 1 medium sized apple",
				"'apple' needs a version: write it as apple@<version>, as in apple@2",
			],
		])("reports %j as an error line", (line, message) => {
			expect(parseLine(line)).toEqual({ kind: "error", message });
		});
	});
});

describe("parseEntryText", () => {
	test("parses a reference with or without a version and unit", () => {
		expect(parseEntryText("  apple 1  ")).toEqual({
			kind: "reference",
			ref: { slug: "apple" },
			amount: 1,
		});
		expect(parseEntryText("apple@2   1 medium \t sized apple")).toEqual({
			kind: "reference",
			ref: { slug: "apple", version: 2 },
			amount: 1,
			unit: "medium sized apple",
		});
		expect(parseEntryText("rice@1 80 g")).toEqual({
			kind: "reference",
			ref: { slug: "rice", version: 1 },
			amount: 80,
			unit: "g",
		});
		expect(parseEntryText("granola 40 cup")).toMatchObject({
			ref: { slug: "granola" },
			unit: "cup",
		});
	});

	test("parses an inline entry, keeping # inside the description", () => {
		expect(parseEntryText('"ramen"   protein=35 kcal=800')).toEqual({
			kind: "inline",
			description: "ramen",
			values: [
				{ id: "protein", value: 35 },
				{ id: "kcal", value: 800 },
			],
		});
		expect(parseEntryText('"ramen # spicy" kcal=800')).toEqual({
			kind: "inline",
			description: "ramen # spicy",
			values: [{ id: "kcal", value: 800 }],
		});
	});

	test.each([
		["a trailing comment on a reference", "apple 1 medium apple  # at work"],
		["a trailing comment on an inline entry", '"ramen" kcal=800 # x'],
		["a # in a unit", "apple 1 can#2"],
	])("rejects %s as a comment", (_name, text) => {
		expect(() => parseEntryText(text)).toThrow(
			"entries can't contain comments ('#'); add comments to the day file by hand",
		);
	});

	test.each([
		["an empty value", "", "expected an entry such as"],
		["a blank value", "   ", "expected an entry such as"],
		["a comment", "# note", "expected an entry such as"],
		["a section header", "[lunch]", "expected an entry such as"],
		["a zero amount", "apple 0", "the amount must be a positive number"],
		["a missing amount", "apple", "'apple' needs an amount"],
		["a bad version", "apple@x 1", "positive whole number"],
		["a bad slug", "../apple 1", "not a valid food or recipe name"],
		["an unclosed description", '"ramen # kcal=800', "no closing"],
		["an inline entry without values", '"ramen"', "needs nutrient values"],
		["an amount in an inline entry", '"ramen" 1 bowl', "expected <nutrient>"],
	])("rejects %s", (_name, text, message) => {
		expect(() => parseEntryText(text)).toThrow(message);
	});

	describe("times", () => {
		test("parses a timed reference with or without a version", () => {
			expect(parseEntryText("08:15 apple 1 medium sized apple")).toEqual({
				kind: "reference",
				time: "08:15",
				ref: { slug: "apple" },
				amount: 1,
				unit: "medium sized apple",
			});
			expect(parseEntryText("07:30 oats@2 60 g")).toEqual({
				kind: "reference",
				time: "07:30",
				ref: { slug: "oats", version: 2 },
				amount: 60,
				unit: "g",
			});
		});

		test("parses a timed inline entry", () => {
			expect(parseEntryText('08:10 "hotel coffee" kcal=5')).toEqual({
				kind: "inline",
				time: "08:10",
				description: "hotel coffee",
				values: [{ id: "kcal", value: 5 }],
			});
		});

		test("ignores the spacing around and after the time", () => {
			expect(
				parseEntryText("  08:15    apple   1 medium sized apple "),
			).toEqual({
				kind: "reference",
				time: "08:15",
				ref: { slug: "apple" },
				amount: 1,
				unit: "medium sized apple",
			});
		});

		test.each([
			[
				"7up 1 can",
				{ kind: "reference", ref: { slug: "7up" }, amount: 1, unit: "can" },
			],
			[
				'"ramen # spicy" kcal=800',
				{
					kind: "inline",
					description: "ramen # spicy",
					values: [{ id: "kcal", value: 800 }],
				},
			],
		])("reads %j as untimed", (text, entry) => {
			const parsed = parseEntryText(text);

			expect(parsed).toEqual(entry as typeof parsed);
			expect(parsed).not.toHaveProperty("time");
		});

		test.each([
			["08:15", "the time '08:15' needs an entry after it"],
			["08:15 # x", "the time '08:15' needs an entry after it"],
			[
				"08:15 apple 1 # x",
				"entries can't contain comments ('#'); add comments to the day file by hand",
			],
			[
				"8:15 milk 200 ml",
				"'8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59",
			],
			["[lunch]", "expected an entry such as"],
			["", "expected an entry such as"],
			["# x", "expected an entry such as"],
		])("rejects %j", (text, message) => {
			expect(() => parseEntryText(text)).toThrow(message);
		});
	});
});
