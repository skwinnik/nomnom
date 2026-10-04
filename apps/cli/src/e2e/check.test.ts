import { expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, withSandbox } from "./nomnom";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

test("check reports every problem in the data directory once", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const path = (...parts: string[]) => join(dir, ...parts);
		/** Replaces the first occurrence of `from`, which must be there. */
		const edit = async (file: string, from: string, to: string) => {
			const text = await readFile(file, "utf8");
			expect(text).toContain(from);
			await writeFile(file, text.replace(from, to));
		};

		const food = (name: string, ...args: string[]) =>
			nomnom("food", "add", "--name", name, "--base-unit", "g", ...args);
		expectOk(await food("Apple", "--kcal", "52"));
		expectOk(await food("Carrot", "--kcal", "41"));
		expectOk(
			await nomnom(
				"food",
				"update",
				"carrot",
				"--name",
				"Carrot",
				"--base-unit",
				"g",
				"--kcal",
				"40",
			),
		);
		expectOk(await food("Rice", "--kcal", "360"));
		expectOk(await food("Cola", "--kcal", "42", "--barcode", "4601234567890"));
		expectOk(await food("Cola Zero", "--kcal", "1"));
		const recipe = (name: string, ...ingredients: string[]) =>
			nomnom(
				"recipe",
				"add",
				"--name",
				name,
				...ingredients.flatMap((text) => ["--ingredient", text]),
			);
		expectOk(await recipe("Soup", "carrot@1=100"));
		expectOk(
			await nomnom(
				"recipe",
				"update",
				"soup",
				"--name",
				"Soup",
				"--ingredient",
				"carrot=100",
			),
		);
		expectOk(await recipe("Pie", "apple=100"));
		expectOk(await recipe("A", "rice=10"));
		expectOk(await recipe("B", "rice=10"));
		expectOk(
			await nomnom("log", "lunch", "rice", "80", "--date", "2025-03-02"),
		);
		expectOk(
			await nomnom("log", "lunch", "apple", "150", "--date", "2026-09-28"),
		);
		expectOk(
			await nomnom("log", "dinner", "rice", "80", "--date", "2026-09-29"),
		);

		expect(expectOk(await nomnom("check")).out).toBe(
			"No errors in 5 foods, 4 recipes and 3 day files\n",
		);

		// Version 1 of apple, pinned by a day and by pie, loses the required kcal.
		await edit(path("foods", "apple.yaml"), "  kcal: 52\n", "  fat: 0.2\n");
		// A misspelled nutrient id in rice, which a, b and two days pin.
		await edit(
			path("foods", "rice.yaml"),
			"  kcal: 360\n",
			"  kcal: 360\n  protien: 7\n",
		);
		// Version 1 of soup pins a version of carrot that doesn't exist.
		await edit(
			path("recipes", "soup.yaml"),
			"    version: 1\n",
			"    version: 7\n",
		);
		// a and b contain each other.
		for (const [slug, other] of [
			["a", "b"],
			["b", "a"],
		] as const) {
			await edit(
				path("recipes", `${slug}.yaml`),
				"  - food: rice\n    version: 1\n    amount: 10\n    unit: g\n",
				`  - recipe: ${other}\n    version: 1\n    amount: 1\n    unit: serving\n`,
			);
		}
		// Cola Zero gets Cola's barcode, in another form.
		await edit(
			path("foods", "cola-zero.yaml"),
			"name: Cola Zero\n",
			'name: Cola Zero\nbarcodes:\n  - "04601234567890"\n',
		);
		// A bad line in a day no report has covered.
		await edit(
			path("logs", "2025", "2025-03-02.nom"),
			"rice@1 80 g\n",
			"rice@1 80 g\nrice 80\n",
		);
		await mkdir(path("logs", "2026"), { recursive: true });
		await writeFile(path("logs", "2026", "2026-9-30.nom"), "[lunch]\n");
		// A section for a meal that is not configured.
		await edit(
			path("logs", "2026", "2026-09-29.nom"),
			"rice@1 80 g\n",
			"rice@1 80 g\n\n[brunch]\nrice@1 20\n",
		);

		const result = await nomnom("check");

		expect(result).toEqual({
			code: 1,
			out: "",
			err: [
				`warning: ${path("logs", "2026", "2026-09-29.nom")}:4: 'brunch' is not a meal in config.yaml; it is kept after the configured meals`,
				"error: 7 errors in 7 files",
				`${path("foods", "apple.yaml")}: version 1: the required nutrient 'kcal' is missing`,
				`${path("foods", "cola-4601234567890.yaml")}: the barcode '4601234567890' (normalized: 4601234567890) also belongs to cola-zero@1`,
				`${path("foods", "rice.yaml")}: version 1: 'protien' is not a nutrient in config.yaml`,
				`${path("recipes", "a.yaml")}: version 1: recipes reference each other in a cycle: a@1, b@1`,
				`${path("recipes", "soup.yaml")}: version 1, ingredient 1 (carrot@7): 'carrot@7' does not exist: food 'carrot' has versions 1 to 2`,
				`${path("logs", "2025", "2025-03-02.nom")}:3: 'rice' needs a version: write it as rice@<version>, as in apple@2`,
				`${path("logs", "2026", "2026-9-30.nom")}: not a day file: day files are logs/<yyyy>/<yyyy-mm-dd>.nom`,
				"",
			].join("\n"),
		});

		// Other commands reject the unusable version at the line that pins it.
		const report = await nomnom("report", "2026-09-28");
		expect(report.code).toBe(1);
		expect(report.err).toContain(
			`${path("logs", "2026", "2026-09-28.nom")}:2: 'apple@1' is unusable: the required nutrient 'kcal' is missing`,
		);
	}));

test("check accepts timed entries and names the line of a malformed time", () =>
	withSandbox(async ({ dir, nomnom }) => {
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Test Oats",
				"--base-unit",
				"g",
				"--kcal",
				"370",
			),
		);
		const day = join(dir, "logs", "2026", "2026-09-29.nom");
		await mkdir(join(dir, "logs", "2026"), { recursive: true });
		const timed = [
			"[breakfast]",
			"07:30 test-oats@1 60 g",
			"test-oats@1 20",
			"",
			"[dinner]",
			'19:30\t"made-up ramen"  kcal=800  # late',
			"",
		].join("\n");
		await writeFile(day, timed);

		expect(expectOk(await nomnom("check")).out).toBe(
			"No errors in 1 food, 0 recipes and 1 day file\n",
		);

		await writeFile(day, timed.replace("07:30 ", "8:15 "));

		expect(await nomnom("check")).toEqual({
			code: 1,
			out: "",
			err: [
				"error: 1 error in 1 file",
				`${day}:2: '8:15' is not a valid time: write it as HH:MM, from 00:00 to 23:59`,
				"",
			].join("\n"),
		});
	}));
