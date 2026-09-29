import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type RunResult,
	type Sandbox,
	snapshotTree,
	withSandbox,
} from "./nomnom";

const date = "2026-09-30";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

/**
 * Foods and a recipe to log: `apple` and `oats` have two versions, and only
 * `apple@1` has the unit `medium sized apple`.
 */
async function addCatalog({ nomnom }: Sandbox): Promise<void> {
	const food = (name: string, unit: string, ...rest: string[]) => [
		"--name",
		name,
		"--base-unit",
		unit,
		"--kcal",
		"50",
		...rest,
	];
	for (const args of [
		["food", "add", ...food("Greek Yogurt", "g")],
		["food", "add", ...food("Apple", "g", "--units", "medium sized apple=180")],
		["food", "update", "apple", ...food("Apple", "g")],
		["food", "add", ...food("Oats", "g")],
		["food", "update", "oats", ...food("Oats", "g", "--protein", "13")],
		["food", "add", ...food("Granola", "g")],
		["food", "add", ...food("Banana", "g", "--units", "banana=120")],
		["food", "add", ...food("Honey", "g")],
		["food", "add", ...food("Milk", "ml")],
		["recipe", "add", "--name", "Porridge", "--ingredient", "oats=60"],
	]) {
		expectOk(await nomnom(...args));
	}
}

function dayFile(dir: string): string {
	return join(dir, "logs", "2026", `${date}.nom`);
}

describe("log --entry", () => {
	test("logs an 8-entry breakfast in one call, keeping every other line", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);
			const original = [
				"# a hand-written day",
				"[breakfast]",
				"oats@1     60 g     # before the run",
				"",
				"[lunch]",
				"milk@1  250   ml",
				"",
			].join("\n");
			await Bun.write(file, original);

			const result = expectOk(
				await sandbox.nomnom(
					"log",
					"breakfast",
					"--entry",
					"greek-yogurt 150 g",
					"--entry",
					"apple@1 1 medium sized apple",
					"--entry",
					"granola   40",
					"--entry",
					"banana 1 banana",
					"--entry",
					"honey 10 g",
					"--entry",
					"milk 200",
					"--entry",
					"porridge 1",
					"--entry",
					'"hotel coffee"   kcal=5',
					"--date",
					date,
				),
			);

			const added = [
				"greek-yogurt@1 150 g",
				"apple@1 1 medium sized apple",
				"granola@1 40 g",
				"banana@1 1 banana",
				"honey@1 10 g",
				"milk@1 200 ml",
				"porridge@1 1 serving",
				'"hotel coffee" kcal=5',
			];
			expect(result.out.split("\n")).toEqual([...added, ""]);
			expect((await readFile(file, "utf8")).split("\n")).toEqual([
				"# a hand-written day",
				"[breakfast]",
				"oats@1     60 g     # before the run",
				...added,
				"",
				"[lunch]",
				"milk@1  250   ml",
				"",
			]);
		}));

	test("writes nothing and reports every invalid entry when some are invalid", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);
			await Bun.write(file, "[breakfast]\noats@1 60 g\n");
			const before = await snapshotTree(sandbox.dir);

			const result = await sandbox.nomnom(
				"log",
				"breakfast",
				"--entry",
				"oats 60 g",
				"--entry",
				"granola 40 cup",
				"--entry",
				"unicorn 1",
				"--date",
				date,
			);

			expect(result.code).toBe(1);
			expect(result.out).toBe("");
			expect(result.err).toBe(
				[
					"error: Can't log 2 of 3 entries",
					"entry 2 'granola 40 cup': 'cup' is not a unit of granola@1; it allows 'g'",
					"entry 3 'unicorn 1': 'unicorn' is neither a food nor a recipe",
					"",
				].join("\n"),
			);
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
		}));

	test("can't be combined with a positional entry", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const before = await snapshotTree(sandbox.dir);

			const result = await sandbox.nomnom(
				"log",
				"breakfast",
				"apple",
				"1",
				"--entry",
				"oats 60 g",
			);

			expect(result.code).toBe(1);
			expect(result.err).toBe(
				"error: Give --entry values, or one entry as a food or recipe with an amount or with --inline, not both\n",
			);
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
		}));

	test("a dry run previews every added line as one block", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);
			const day =
				"[breakfast]\noats@2 60 g\nmilk@1 200 ml\n\n[lunch]\napple@2 100 g\n";
			await Bun.write(file, day);

			const result = expectOk(
				await sandbox.nomnom(
					"log",
					"breakfast",
					"--entry",
					"apple 150 g",
					"--entry",
					'"coffee" kcal=5',
					"--date",
					date,
					"--dry-run",
				),
			);

			expect(result.out).toBe(
				[
					"apple@2 150 g",
					'"coffee" kcal=5',
					"",
					file,
					"  oats@2 60 g",
					"  milk@1 200 ml",
					"+ apple@2 150 g",
					'+ "coffee" kcal=5',
					"",
					"  [lunch]",
					"",
					"Dry run: no files were changed.",
					"",
				].join("\n"),
			);
			expect(await readFile(file, "utf8")).toBe(day);
		}));
});
