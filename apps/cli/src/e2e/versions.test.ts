import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, withSandbox } from "./nomnom";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

test("updating, renaming and archiving a food keeps earlier versions and references", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const date = "2026-09-29";
		const appleFile = join(dir, "foods", "apple.yaml");
		const saladFile = join(dir, "recipes", "fruit-salad.yaml");
		const dayFile = join(dir, "logs", "2026", `${date}.nom`);
		const read = (path: string) => readFile(path, "utf8");

		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Apple",
				"--base-unit",
				"g",
				"--kcal",
				"52",
				"--fiber",
				"2.4",
			),
		);
		expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Fruit Salad",
				"--ingredient",
				"apple=200 g",
			),
		);
		expectOk(await nomnom("log", "snack", "apple", "100", "--date", date));
		const [version1, salad, day] = await Promise.all([
			read(appleFile),
			read(saladFile),
			read(dayFile),
		]);

		// A new version, with the omitted fiber reported as removed.
		expect(
			expectOk(
				await nomnom(
					"food",
					"update",
					"apple",
					"--name",
					"Apple",
					"--base-unit",
					"g",
					"--kcal",
					"55",
				),
			).out,
		).toBe(
			[
				`Updated ${appleFile} (version 2)`,
				"  kcal: 52 -> 55",
				"  fiber: 2.4 -> (none)",
				"",
			].join("\n"),
		);
		const version2 = await read(appleFile);
		expect(version2).toStartWith(version1);

		// The same values again change nothing.
		const same = await nomnom(
			"food",
			"update",
			"apple",
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"55",
		);
		expect(same.code).toBe(1);
		expect(same.err).toBe(
			"error: Nothing changed: the values are those of apple@2\n",
		);
		expect(await read(appleFile)).toBe(version2);

		// A rename creates a new file and archives the old food.
		const greenAppleFile = join(dir, "foods", "green-apple.yaml");
		expect(
			expectOk(
				await nomnom(
					"food",
					"update",
					"apple",
					"--name",
					"Green Apple",
					"--base-unit",
					"g",
					"--kcal",
					"55",
				),
			).out,
		).toBe(
			[
				`Created ${greenAppleFile}`,
				`Archived ${appleFile} (version 3)`,
				"  name: Apple -> Green Apple",
				"",
			].join("\n"),
		);
		const version3 = await read(appleFile);
		expect(version3).toStartWith(version2);
		expect(version3.slice(version2.length)).toContain("archived: true\n");
		expect(expectOk(await nomnom("food", "list")).out).toBe(
			"green-apple@1  food  Green Apple\n",
		);

		// The archived slug can't be newly referenced, nor archived again.
		const refused = await nomnom("log", "snack", "apple", "50", "--date", date);
		expect(refused.code).toBe(1);
		expect(refused.err).toContain("'apple' is archived");
		const again = await nomnom("food", "archive", "apple");
		expect(again.err).toBe("error: 'apple' is already archived\n");

		// Archiving the new food appends a version too.
		expect(expectOk(await nomnom("food", "archive", "green-apple")).out).toBe(
			`Archived ${greenAppleFile} (version 2)\n`,
		);
		expect(expectOk(await nomnom("food", "unarchive", "green-apple")).out).toBe(
			`Unarchived ${greenAppleFile} (version 3)\n`,
		);

		// The recipe and the day file are untouched and still resolve apple@1.
		expect(await read(saladFile)).toBe(salad);
		expect(await read(dayFile)).toBe(day);
		expect(
			expectOk(await nomnom("recipe", "show", "fruit-salad")).out,
		).toContain("apple@1  200 g");
		// 200 g apple at 52 kcal per 100 g.
		expect(expectOk(await nomnom("recipe", "show", "fruit-salad")).out).toMatch(
			/Energy\s+104\.0 kcal/,
		);
		// The day's apple is version 1: 52 kcal and 2.4 g fiber in 100 g.
		expect(expectOk(await nomnom("report", date)).out).toMatch(
			/Apple\s+100 g\s+52\.0\s+0\.0\s+0\.0\s+0\.0\s+2\.4\n/,
		);
	}));

test("renaming a food with a barcode keeps the barcode on the new slug", () =>
	withSandbox(async ({ dir, nomnom }) => {
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Milk",
				"--base-unit",
				"ml",
				"--kcal",
				"60",
				"--barcode",
				"4600000000001",
			),
		);

		expectOk(
			await nomnom(
				"food",
				"update",
				"milk-4600000000001",
				"--name",
				"Whole Milk",
				"--base-unit",
				"ml",
				"--kcal",
				"64",
				"--barcode",
				"4600000000001",
			),
		);

		expect((await readdir(join(dir, "foods"))).sort()).toEqual([
			"milk-4600000000001.yaml",
			"whole-milk-4600000000001.yaml",
		]);
		expect(
			expectOk(await nomnom("food", "show", "--barcode", "4600000000001")).out,
		).toStartWith("whole-milk-4600000000001@1  food  Whole Milk\n");
	}));
