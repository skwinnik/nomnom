import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, withSandbox } from "./nomnom";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

test("foods, a nested recipe and a hand-edited day file work together", () =>
	withSandbox(async ({ dir, nomnom }) => {
		const date = ["--date", "2026-09-29"];
		const dayFile = join(dir, "logs", "2026", "2026-09-29.nom");
		const readDay = () => readFile(dayFile, "utf8");

		// Foods.
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Chicken Breast",
				"--base-unit",
				"g",
				"--kcal",
				"165",
				"--protein",
				"31",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Carrot",
				"--base-unit",
				"g",
				"--kcal",
				"41",
				"--units",
				"medium carrot=61",
			),
		);
		expectOk(
			await nomnom(
				"food",
				"add",
				"--name",
				"Water",
				"--base-unit",
				"ml",
				"--kcal",
				"0",
			),
		);
		expect(await readFile(join(dir, "foods", "carrot.yaml"), "utf8")).toContain(
			"units:\n  medium carrot: 61\n",
		);

		// A recipe, and a recipe that contains it.
		expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Chicken Stock",
				"--base-unit",
				"g",
				"--yield",
				"2000",
				"--ingredient",
				"chicken-breast=1000 g",
				"--ingredient",
				"water=1500",
			),
		);
		const soup = expectOk(
			await nomnom(
				"recipe",
				"add",
				"--name",
				"Chicken Soup",
				"--servings",
				"2",
				"--ingredient",
				"chicken-stock=500 g",
				"--ingredient",
				"carrot=2 medium carrot",
			),
		);
		// 500 of 2000 g stock (1650 kcal) plus 122 g carrot: 462.52 kcal in 2 servings.
		expect(soup.out).toStartWith(
			`Created ${join(dir, "recipes", "chicken-soup.yaml")}\n`,
		);
		expect(soup.out).toMatch(/Energy\s+231\.3 kcal/);
		expect(soup.out).not.toContain("Per 100");
		expect(
			await readFile(join(dir, "recipes", "chicken-soup.yaml"), "utf8"),
		).toContain(
			"  - recipe: chicken-stock\n    version: 1\n    amount: 500\n    unit: g\n",
		);

		// Reference and inline entries.
		expect(
			expectOk(
				await nomnom(
					"log",
					"dinner",
					"--inline",
					"restaurant ramen",
					"--kcal",
					"800",
					"--protein",
					"35",
					...date,
				),
			).out,
		).toBe('"restaurant ramen" kcal=800 protein=35\n');
		expect(
			expectOk(
				await nomnom(
					"log",
					"breakfast",
					"carrot",
					"1",
					"medium",
					"carrot",
					...date,
				),
			).out,
		).toBe("carrot@1 1 medium carrot\n");
		expect(
			expectOk(
				await nomnom("log", "lunch", "chicken-soup", "1", "serving", ...date),
			).out,
		).toBe("chicken-soup@1 1 serving\n");
		expect(await readDay()).toBe(
			[
				"[breakfast]",
				"carrot@1 1 medium carrot",
				"",
				"[lunch]",
				"chicken-soup@1 1 serving",
				"",
				"[dinner]",
				'"restaurant ramen" kcal=800 protein=35',
				"",
			].join("\n"),
		);

		// Hand edits survive the next log unchanged.
		const handEdited = [
			"# a slow morning",
			"[breakfast]",
			"carrot@1 1 medium carrot",
			"carrot@1      100   g     # by hand, aligned my way",
			"",
			"[lunch]",
			"chicken-soup@1 1 serving",
			"",
			"[dinner]",
			'"restaurant ramen" kcal=800 protein=35',
			"",
		].join("\n");
		await writeFile(dayFile, handEdited);
		expectOk(await nomnom("log", "breakfast", "water", "250", ...date));
		const afterLog = handEdited.replace(
			"# by hand, aligned my way\n",
			"# by hand, aligned my way\nwater@1 250 ml\n",
		);
		expect(await readDay()).toBe(afterLog);

		// An invalid line blocks logging and is reported with its line number.
		const broken = afterLog.replace(
			"chicken-soup@1 1 serving",
			"chicken-soup 1 serving",
		);
		await writeFile(dayFile, broken);
		const refused = await nomnom("log", "snack", "carrot", "1", ...date);
		expect(refused.code).toBe(1);
		expect(refused.out).toBe("");
		expect(refused.err).toContain(
			`${dayFile}:8: 'chicken-soup' needs a version`,
		);
		expect(await readDay()).toBe(broken);

		// Fixed by hand, logging works again.
		await writeFile(dayFile, afterLog);
		expect(
			expectOk(await nomnom("log", "snack", "carrot", "1", ...date)).out,
		).toBe("carrot@1 1 g\n");
		expect(await readDay()).toBe(`${afterLog}\n[snack]\ncarrot@1 1 g\n`);
	}));
