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
		["food", "add", ...food("Coffee", "ml", "--units", "cup=240")],
		["recipe", "add", "--name", "Porridge", "--ingredient", "oats=60"],
	]) {
		expectOk(await nomnom(...args));
	}
}

function dayFile(dir: string, day = date): string {
	return join(dir, "logs", day.slice(0, 4), `${day}.nom`);
}

/** Today's local date, as the CLI computes it. */
function today(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

describe("log with a time", () => {
	test("--time with the positional and --inline forms writes timed lines", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);

			const reference = expectOk(
				await sandbox.nomnom(
					"log",
					"breakfast",
					"apple@1",
					"1",
					"medium",
					"sized",
					"apple",
					"--time",
					"08:15",
					"--date",
					date,
				),
			);
			const inline = expectOk(
				await sandbox.nomnom(
					"log",
					"dinner",
					"--inline",
					"restaurant ramen",
					"--kcal",
					"800",
					"--protein",
					"35",
					"--time",
					"19:30",
					"--date",
					date,
				),
			);

			expect(reference.out).toBe("08:15 apple@1 1 medium sized apple\n");
			expect(inline.out).toBe('19:30 "restaurant ramen" kcal=800 protein=35\n');
			expect(await readFile(file, "utf8")).toBe(
				[
					"[breakfast]",
					"08:15 apple@1 1 medium sized apple",
					"",
					"[dinner]",
					'19:30 "restaurant ramen" kcal=800 protein=35',
					"",
				].join("\n"),
			);
			expectOk(await sandbox.nomnom("check"));
		}));

	test("writes a mixed --entry batch and a batch with --time", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);

			const mixed = expectOk(
				await sandbox.nomnom(
					"log",
					"breakfast",
					"--entry",
					"07:30 oats 60 g",
					"--entry",
					"milk 200 ml",
					"--entry",
					'08:10 "hotel coffee" kcal=5',
					"--date",
					date,
				),
			);
			const batch = expectOk(
				await sandbox.nomnom(
					"log",
					"lunch",
					"--time",
					"07:45",
					"--entry",
					"oats 60 g",
					"--entry",
					"milk 200 ml",
					"--date",
					date,
				),
			);

			expect(mixed.out).toBe(
				'07:30 oats@2 60 g\nmilk@1 200 ml\n08:10 "hotel coffee" kcal=5\n',
			);
			expect(batch.out).toBe("07:45 oats@2 60 g\n07:45 milk@1 200 ml\n");
			expect(await readFile(file, "utf8")).toBe(
				[
					"[breakfast]",
					"07:30 oats@2 60 g",
					"milk@1 200 ml",
					'08:10 "hotel coffee" kcal=5',
					"",
					"[lunch]",
					"07:45 oats@2 60 g",
					"07:45 milk@1 200 ml",
					"",
				].join("\n"),
			);
		}));

	test("reports conflicting times with the other invalid entries and writes nothing", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			await Bun.write(dayFile(sandbox.dir), "[breakfast]\noats@1 60 g\n");
			const before = await snapshotTree(sandbox.dir);

			const result = await sandbox.nomnom(
				"log",
				"breakfast",
				"--time",
				"08:00",
				"--entry",
				"07:30 oats 60 g",
				"--entry",
				"milk 200 ml",
				"--entry",
				"08:00 coffee 1 cup",
				"--entry",
				"granola 40 cup",
				"--date",
				date,
			);

			expect(result.code).toBe(1);
			expect(result.out).toBe("");
			expect(result.err).toBe(
				[
					"error: Can't log 3 of 4 entries",
					"entry 1 '07:30 oats 60 g': it has its own time 07:30, which conflicts with --time 08:00",
					"entry 3 '08:00 coffee 1 cup': it has its own time 08:00, which conflicts with --time 08:00",
					"entry 4 'granola 40 cup': 'cup' is not a unit of granola@1; it allows 'g'",
					"",
				].join("\n"),
			);
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
		}));

	test.each([
		[
			["breakfast", "apple", "1", "--time", "8:15"],
			"error: The time must be HH:MM, from 00:00 to 23:59, got '8:15'\n",
		],
		[
			[
				"breakfast",
				"--entry",
				"oats 60 g",
				"--entry",
				"milk 200",
				"--time",
				"24:00",
			],
			"error: The time must be HH:MM, from 00:00 to 23:59, got '24:00'\n",
		],
		[
			["breakfast", "08:15", "apple", "1"],
			"error: Give the time with --time, as in 'nomnom log breakfast apple 1 --time 08:15'\n",
		],
	])("rejects %p and writes nothing", (args, err) =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const before = await snapshotTree(sandbox.dir);

			const result = await sandbox.nomnom("log", ...args, "--date", date);

			expect(result).toEqual({ code: 1, out: "", err });
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
		}),
	);

	test("never adds the current time, today or on a backdated date", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const day = today();

			const now = expectOk(await sandbox.nomnom("log", "snack", "apple", "1"));
			const backdated = expectOk(
				await sandbox.nomnom(
					"log",
					"snack",
					"apple",
					"1",
					"--date",
					"2026-09-20",
				),
			);

			expect(now.out).toBe("apple@2 1 g\n");
			expect(backdated.out).toBe("apple@2 1 g\n");
			// The run may have crossed midnight: then it logged to the next day.
			const written =
				(await readFile(dayFile(sandbox.dir, day), "utf8").catch(
					() => undefined,
				)) ?? (await readFile(dayFile(sandbox.dir, today()), "utf8"));
			expect(written).toBe("[snack]\napple@2 1 g\n");
			expect(await readFile(dayFile(sandbox.dir, "2026-09-20"), "utf8")).toBe(
				"[snack]\napple@2 1 g\n",
			);
		}));

	test("a dry run previews timed entries as a real run writes them", () =>
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
					"08:15 apple 150 g",
					"--entry",
					'"coffee" kcal=5',
					"--date",
					date,
					"--dry-run",
				),
			);

			expect(result.out).toBe(
				[
					"08:15 apple@2 150 g",
					'"coffee" kcal=5',
					"",
					file,
					"  oats@2 60 g",
					"  milk@1 200 ml",
					"+ 08:15 apple@2 150 g",
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

	test("a timed dry run of the first entry of the day creates nothing", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const file = dayFile(sandbox.dir);
			const before = await snapshotTree(sandbox.dir);

			const result = expectOk(
				await sandbox.nomnom(
					"log",
					"snack",
					"--inline",
					"cookie",
					"--kcal",
					"120",
					"--time",
					"16:00",
					"--date",
					date,
					"--dry-run",
				),
			);

			expect(result.out).toBe(
				[
					'16:00 "cookie" kcal=120',
					"",
					`${file} (new file)`,
					"+ [snack]",
					'+ 16:00 "cookie" kcal=120',
					"",
					"Dry run: no files were changed.",
					"",
				].join("\n"),
			);
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
			expect(await snapshotTree(join(sandbox.dir, "logs", "2026"))).toBe(
				"missing",
			);
		}));

	test("a dry run with a conflicting time fails and previews nothing", () =>
		withSandbox(async (sandbox) => {
			await addCatalog(sandbox);
			const before = await snapshotTree(sandbox.dir);

			const result = await sandbox.nomnom(
				"log",
				"breakfast",
				"--time",
				"08:00",
				"--entry",
				"oats 60 g",
				"--entry",
				"08:00 milk 200 ml",
				"--date",
				date,
				"--dry-run",
			);

			expect(result).toEqual({
				code: 1,
				out: "",
				err: [
					"error: Can't log 1 of 2 entries",
					"entry 2 '08:00 milk 200 ml': it has its own time 08:00, which conflicts with --time 08:00",
					"",
				].join("\n"),
			});
			expect(await snapshotTree(sandbox.dir)).toEqual(before);
		}));

	test("help lists --time with HH:MM", () =>
		withSandbox(async (sandbox) => {
			const result = expectOk(await sandbox.nomnom("log", "--help"));

			expect(result.out).toMatch(/--time <HH:MM> +The time of the entries/);
		}));
});
