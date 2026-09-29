import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withSandbox } from "./nomnom";

const addRice = [
	"food",
	"add",
	"--name",
	"Rice",
	"--base-unit",
	"g",
	"--kcal",
	"360",
];

describe("data directory", () => {
	test("NOMNOM_DIR is used when set", () =>
		withSandbox(async ({ dir, nomnomWithEnv }) => {
			const data = join(dir, "data");

			const result = await nomnomWithEnv(
				{ NOMNOM_DIR: data, HOME: join(dir, "home") },
				...addRice,
			);

			expect(result).toMatchObject({ code: 0, err: "" });
			expect(result.out).toBe(`Created ${join(data, "foods", "rice.yaml")}\n`);
			expect(await readdir(dir)).toEqual(["data"]);
		}));

	test.each([
		["unset", undefined],
		["empty", ""],
	])("$HOME/.nomnom is used when NOMNOM_DIR is %s", (_name, value) =>
		withSandbox(async ({ dir, nomnomWithEnv }) => {
			const home = join(dir, "home");

			const result = await nomnomWithEnv(
				{ NOMNOM_DIR: value, HOME: home },
				...addRice,
			);

			expect(result).toMatchObject({ code: 0, err: "" });
			expect(result.out).toBe(
				`Created ${join(home, ".nomnom", "foods", "rice.yaml")}\n`,
			);
		}),
	);

	test("the first write creates the data directory, config.yaml and foods/", () =>
		withSandbox(async ({ dir, nomnomWithEnv }) => {
			const data = join(dir, "not", "there", "yet");

			const result = await nomnomWithEnv({ NOMNOM_DIR: data }, ...addRice);

			expect(result.code).toBe(0);
			expect((await readdir(data)).sort()).toEqual(["config.yaml", "foods"]);
			expect(await readFile(join(data, "config.yaml"), "utf8")).toContain(
				"- id: kcal",
			);
			expect(
				await readFile(join(data, "foods", "rice.yaml"), "utf8"),
			).toStartWith("---\n");
		}));

	test("an invalid config.yaml fails the command, naming the file", () =>
		withSandbox(async ({ dir, nomnom }) => {
			await Bun.write(join(dir, "config.yaml"), "nutrients: [\n");

			const result = await nomnom(...addRice);

			expect(result.code).toBe(1);
			expect(result.err).toContain("config.yaml");
			expect(await readdir(dir)).toEqual(["config.yaml"]);
		}));
});
