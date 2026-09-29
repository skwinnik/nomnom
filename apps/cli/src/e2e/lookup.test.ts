import { expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, withSandbox } from "./nomnom";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

test("foods and recipes can be listed, shown and searched", () =>
	withSandbox(async ({ nomnom }) => {
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
				"--protein",
				"0.3",
				"--units",
				"medium sized apple=180",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Cola",
				"--base-unit",
				"ml",
				"--kcal",
				"42",
				"--barcode",
				"034000470693",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Greek Yogurt 2%",
				"--base-unit",
				"g",
				"--kcal",
				"66",
			),
		);
		expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Yogurt Bowl",
				"--base-unit",
				"g",
				"--yield",
				"300",
				"--servings",
				"2",
				"--ingredient",
				"greek-yogurt-2=200 g",
				"--ingredient",
				"apple=1 medium sized apple",
			),
		);

		expect(expectOk(await nomnom("food", "list")).out).toBe(
			[
				"apple@1              food  Apple",
				"cola-034000470693@1  food  Cola",
				"greek-yogurt-2@1     food  Greek Yogurt 2%",
				"",
			].join("\n"),
		);
		expect(expectOk(await nomnom("recipe", "list")).out).toBe(
			"yogurt-bowl@1  recipe  Yogurt Bowl\n",
		);

		const apple = expectOk(await nomnom("food", "show", "apple")).out;
		expect(apple).toStartWith("apple@1  food  Apple\nCreated: ");
		expect(apple).toEndWith(
			[
				"Per 100 g:",
				"  Energy          52 kcal",
				"  Protein        0.3 g",
				"  Fat              - g",
				"  Carbohydrates    - g",
				"  Fiber            - g",
				"Units:",
				"  g                   base unit",
				"  medium sized apple  180 g",
				"",
			].join("\n"),
		);

		// The EAN-13 form of the stored UPC-A code finds the food.
		const cola = expectOk(
			await nomnom("food", "show", "--barcode", "0034000470693"),
		).out;
		expect(cola).toStartWith("cola-034000470693@1  food  Cola\n");
		expect(cola).toContain("Barcodes: 034000470693\n");

		// 200 g yogurt (132 kcal) and 180 g apple (93.6 kcal) in 2 servings of 150 g.
		const bowl = expectOk(await nomnom("recipe", "show", "yogurt-bowl")).out;
		expect(bowl).toContain(
			[
				"Servings: 2",
				"Yield: 300 g",
				"Units:",
				"  g        base unit",
				"  serving  150 g",
				"Ingredients:",
				"  greek-yogurt-2@1  200 g",
				"  apple@1           1 medium sized apple",
				"Per serving:",
				"  Energy         112.8 kcal",
			].join("\n"),
		);
		expect(bowl).toMatch(/Per 100 g:\n {2}Energy\s+75\.2 kcal/);

		expect(expectOk(await nomnom("search", "yogrt")).out).toBe(
			[
				"greek-yogurt-2@1  food    Greek Yogurt 2%",
				"yogurt-bowl@1     recipe  Yogurt Bowl",
				"",
			].join("\n"),
		);
		expect(expectOk(await nomnom("search", "pear")).out).toBe(
			"No foods or recipes match 'pear'\n",
		);
	}));

test("food add rejects a barcode another food has, in another form", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const add = (name: string, barcode: string) =>
			nomnom(
				"food",
				"add",
				"--name",
				name,
				"--base-unit",
				"ml",
				"--kcal",
				"42",
				"--barcode",
				barcode,
			);
		expectOk(await add("Cola", "034000470693"));

		const refused = await add("Coca Cola", "0034000470693");

		expect(refused).toEqual({
			code: 1,
			out: "",
			err: "error: Barcode '0034000470693' already belongs to the food 'cola-034000470693'\n",
		});
		expect(await readdir(join(dir, "foods"))).toEqual([
			"cola-034000470693.yaml",
		]);
	}));

test("a broken food file fails food list, naming it", () =>
	withSandbox(async ({ dir, nomnom }) => {
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
			),
		);
		const rice = join(dir, "foods", "rice.yaml");
		await writeFile(rice, "version: [\n");

		const result = await nomnom("food", "list");

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toContain(rice);
	}));
