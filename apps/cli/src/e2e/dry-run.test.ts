import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type RunResult, snapshotTree, withSandbox } from "./nomnom";

const date = "2026-09-30";
const dryRunEnd = "\nDry run: no files were changed.\n";

function expectOk(result: RunResult): RunResult {
	expect(result.err).toBe("");
	expect(result.code).toBe(0);
	return result;
}

/** The preview headers of a dry run: every line that starts with the data directory. */
function previewed(out: string, dir: string): string[] {
	return out.split("\n").filter((line) => line.startsWith(dir));
}

describe("dry run", () => {
	test(
		"no writing command changes a populated data directory",
		() =>
			withSandbox(async ({ dir, nomnom }) => {
				for (const args of [
					[
						"food",
						"add",
						"--name",
						"Apple",
						"--base-unit",
						"g",
						"--kcal",
						"52",
					],
					[
						"food",
						"add",
						"--name",
						"Oats",
						"--base-unit",
						"g",
						"--kcal",
						"380",
					],
					[
						"food",
						"add",
						"--name",
						"Milk",
						"--base-unit",
						"ml",
						"--kcal",
						"64",
					],
					["food", "add", "--name", "Old Bread", "--base-unit", "g"],
					["food", "archive", "old-bread"],
					["recipe", "add", "--name", "Porridge", "--ingredient", "oats=60"],
					[
						"recipe",
						"add",
						"--name",
						"Old Porridge",
						"--ingredient",
						"oats=50",
					],
					["recipe", "archive", "old-porridge"],
					["log", "breakfast", "oats", "60", "g", "--date", date],
				]) {
					const kcal = args.includes("--base-unit") && !args.includes("--kcal");
					expectOk(await nomnom(...args, ...(kcal ? ["--kcal", "250"] : [])));
				}
				const before = await snapshotTree(dir);
				const at = (path: string) => join(dir, path);

				const cases: { args: string[]; first: string; files: string[] }[] = [
					{
						args: [
							"food",
							"add",
							"--name",
							"Rice",
							"--base-unit",
							"g",
							"--kcal",
							"360",
						],
						first: `Would create ${at("foods/rice.yaml")}`,
						files: [`${at("foods/rice.yaml")} (new file)`],
					},
					{
						args: [
							"food",
							"update",
							"apple",
							"--name",
							"Apple",
							"--base-unit",
							"g",
							"--kcal",
							"55",
						],
						first: `Would update ${at("foods/apple.yaml")} (version 2)`,
						files: [at("foods/apple.yaml")],
					},
					{
						args: [
							"food",
							"update",
							"apple",
							"--name",
							"Green Apple",
							"--base-unit",
							"g",
							"--kcal",
							"52",
						],
						first: `Would create ${at("foods/green-apple.yaml")}`,
						files: [
							`${at("foods/green-apple.yaml")} (new file)`,
							at("foods/apple.yaml"),
						],
					},
					{
						args: ["food", "archive", "apple"],
						first: `Would archive ${at("foods/apple.yaml")} (version 2)`,
						files: [at("foods/apple.yaml")],
					},
					{
						args: ["food", "unarchive", "old-bread"],
						first: `Would unarchive ${at("foods/old-bread.yaml")} (version 3)`,
						files: [at("foods/old-bread.yaml")],
					},
					{
						args: [
							"recipe",
							"add",
							"--name",
							"Oat Bowl",
							"--ingredient",
							"oats=50",
						],
						first: `Would create ${at("recipes/oat-bowl.yaml")}`,
						files: [`${at("recipes/oat-bowl.yaml")} (new file)`],
					},
					{
						args: [
							"recipe",
							"update",
							"porridge",
							"--name",
							"Porridge",
							"--ingredient",
							"oats=70",
						],
						first: `Would update ${at("recipes/porridge.yaml")} (version 2)`,
						files: [at("recipes/porridge.yaml")],
					},
					{
						args: ["recipe", "archive", "porridge"],
						first: `Would archive ${at("recipes/porridge.yaml")} (version 2)`,
						files: [at("recipes/porridge.yaml")],
					},
					{
						args: ["recipe", "unarchive", "old-porridge"],
						first: `Would unarchive ${at("recipes/old-porridge.yaml")} (version 3)`,
						files: [at("recipes/old-porridge.yaml")],
					},
					{
						args: ["log", "breakfast", "apple", "150", "g", "--date", date],
						first: "apple@1 150 g",
						files: [at(`logs/2026/${date}.nom`)],
					},
				];

				for (const { args, first, files } of cases) {
					const result = expectOk(await nomnom(...args, "--dry-run"));

					expect({ args, first: result.out.split("\n")[0] }).toEqual({
						args,
						first,
					});
					expect({ args, files: previewed(result.out, dir) }).toEqual({
						args,
						files,
					});
					expect(result.out).toEndWith(dryRunEnd);
					expect({ args, tree: await snapshotTree(dir) }).toEqual({
						args,
						tree: before,
					});
				}
			}),
		30_000,
	);

	test.each([
		[
			["food", "add", "--name", "Apple", "--base-unit", "g", "--kcal", "52"],
			"foods/apple.yaml",
		],
		[
			["log", "snack", "--inline", "cookie", "--kcal", "120", "--date", date],
			`logs/2026/${date}.nom`,
		],
	])(
		"%p on a missing data directory previews config.yaml and creates nothing",
		(args, file) =>
			withSandbox(async ({ dir, nomnomWithEnv }) => {
				const data = join(dir, "data");

				const result = expectOk(
					await nomnomWithEnv({ NOMNOM_DIR: data }, ...args, "--dry-run"),
				);

				expect(previewed(result.out, data)).toEqual([
					`${join(data, "config.yaml")} (new file)`,
					`${join(data, file)} (new file)`,
				]);
				expect(result.out).toContain("+   - id: kcal\n");
				expect(result.out).toEndWith(dryRunEnd);
				expect(await snapshotTree(data)).toBe("missing");
			}),
	);

	test("recipe add on a missing data directory fails and creates nothing", () =>
		withSandbox(async ({ dir, nomnomWithEnv }) => {
			const data = join(dir, "data");

			const result = await nomnomWithEnv(
				{ NOMNOM_DIR: data },
				"recipe",
				"add",
				"--name",
				"Porridge",
				"--ingredient",
				"oats=60",
				"--dry-run",
			);

			expect(result.code).toBe(1);
			expect(result.err).toContain("'oats' is neither a food nor a recipe");
			expect(result.out).toBe("");
			expect(await snapshotTree(data)).toBe("missing");
		}));

	test("log previews the inserted line with two lines around it", () =>
		withSandbox(async ({ dir, nomnom }) => {
			for (const [name, unit, versions] of [
				["Oats", "g", 2],
				["Milk", "ml", 1],
				["Apple", "g", 2],
			] as const) {
				expectOk(
					await nomnom(
						"food",
						"add",
						"--name",
						name,
						"--base-unit",
						unit,
						"--kcal",
						"50",
					),
				);
				for (let v = 2; v <= versions; v++) {
					expectOk(
						await nomnom(
							"food",
							"update",
							name.toLowerCase(),
							"--name",
							name,
							"--base-unit",
							unit,
							"--kcal",
							String(50 + v),
						),
					);
				}
			}
			const dayFile = join(dir, "logs", "2026", `${date}.nom`);
			const day =
				"[breakfast]\noats@2 60 g\nmilk@1 200 ml\n\n[lunch]\napple@2 100 g\n";
			await Bun.write(dayFile, day);

			const result = expectOk(
				await nomnom(
					"log",
					"breakfast",
					"apple",
					"150",
					"g",
					"--date",
					date,
					"--dry-run",
				),
			);

			expect(result.out).toBe(
				[
					"apple@2 150 g",
					"",
					dayFile,
					"  oats@2 60 g",
					"  milk@1 200 ml",
					"+ apple@2 150 g",
					"",
					"  [lunch]",
					dryRunEnd,
				].join("\n"),
			);
			expect(await readFile(dayFile, "utf8")).toBe(day);
		}));

	test("a real run writes the document the dry run previewed, apart from created", () =>
		withSandbox(async ({ dir, nomnom }) => {
			const args = [
				"food",
				"add",
				"--name",
				"Rice",
				"--base-unit",
				"g",
				"--kcal",
				"360",
				"--protein",
				"7",
			];
			const file = join(dir, "foods", "rice.yaml");

			const dry = expectOk(await nomnom(...args, "--dry-run"));
			expectOk(await nomnom(...args));

			const lines = dry.out.split("\n");
			const start = lines.indexOf(`${file} (new file)`) + 1;
			const end = lines.indexOf(dryRunEnd.trim());
			const previewedText = lines
				.slice(start, end)
				.filter((line) => line.startsWith("+"))
				.map((line) => `${line.replace(/^\+ ?/, "")}\n`)
				.join("");
			const withoutCreated = (text: string) =>
				text.replace(/^created: .*$/m, "created: <time>");

			expect(start).toBeGreaterThan(0);
			expect(withoutCreated(await readFile(file, "utf8"))).toBe(
				withoutCreated(previewedText),
			);
		}));
});

describe("commit on success", () => {
	test("help and a failing command leave a missing data directory missing", () =>
		withSandbox(async ({ dir, nomnomWithEnv }) => {
			const data = join(dir, "data");

			const help = await nomnomWithEnv(
				{ NOMNOM_DIR: data },
				"food",
				"add",
				"--help",
			);
			const failed = await nomnomWithEnv(
				{ NOMNOM_DIR: data },
				"food",
				"add",
				"--name",
				"Apple",
				"--base-unit",
				"g",
				"--kcal",
				"abc",
			);

			expect(help.code).toBe(0);
			expect(failed.code).toBe(1);
			expect(failed.out).toBe("");
			expect(await snapshotTree(data)).toBe("missing");
		}));
});
