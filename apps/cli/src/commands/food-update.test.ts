import { describe, expect, test } from "bun:test";
import { type FoodUpdated, NomnomError } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { createFoodServiceMock, foodAdded } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { foodAdd } from "./food-add";
import { foodUpdate } from "./food-update";

const updated: FoodUpdated = {
	...foodAdded(),
	food: { ...foodAdded().food, version: 3 },
	changes: [
		{
			kind: "changed",
			field: "nutrients",
			key: "kcal",
			before: "52",
			after: "55",
		},
		{ kind: "changed", field: "nutrients", key: "fiber", before: "2.4" },
	],
};

async function run(argv: string[], foods = createFoodServiceMock({ updated })) {
	const io = createCapturedIo();
	const code = await runCli({
		argv,
		commands: [foodAdd, foodUpdate],
		services: { foods },
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});
	return { code, out: io.out, err: io.err, calls: foods.updateCalls };
}

describe("food update", () => {
	test("passes the slug and every value to the service, as food add does", async () => {
		const result = await run([
			"food",
			"update",
			"apple",
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"55",
			"--units",
			"small sized apple=134",
			"--barcode",
			"4600000000001",
		]);

		expect(result.err).toBe("");
		expect(result.calls).toEqual([
			{
				slug: "apple",
				input: {
					name: "Apple",
					baseUnit: "g",
					per: "100",
					nutrients: { kcal: "55" },
					units: ["small sized apple=134"],
					barcodes: ["4600000000001"],
				},
			},
		]);
	});

	test("prints the file, the new version and the changes", async () => {
		const result = await run([
			"food",
			"update",
			"apple",
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"55",
		]);

		expect(result).toMatchObject({
			code: 0,
			out: [
				"Updated /data/foods/apple.yaml (version 3)",
				"  kcal: 52 -> 55",
				"  fiber: 2.4 -> (none)",
				"",
			].join("\n"),
			err: "",
		});
	});

	test("after a rename, prints the created file and the archived one", async () => {
		const renamed: FoodUpdated = {
			slug: "green-apple",
			path: "/data/foods/green-apple.yaml",
			food: { ...foodAdded().food, name: "Green Apple" },
			archived: {
				...foodAdded(),
				food: { ...foodAdded().food, version: 3, archived: true },
			},
			changes: [
				{
					kind: "changed",
					field: "name",
					before: "Apple",
					after: "Green Apple",
				},
			],
		};

		const result = await run(
			[
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
			createFoodServiceMock({ updated: renamed }),
		);

		expect(result.out).toBe(
			[
				"Created /data/foods/green-apple.yaml",
				"Archived /data/foods/apple.yaml (version 3)",
				"  name: Apple -> Green Apple",
				"",
			].join("\n"),
		);
	});

	test("requires the slug", async () => {
		const result = await run([
			"food",
			"update",
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"52",
		]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("missing argument <slug>");
		expect(result.calls).toEqual([]);
	});

	test("reports service errors", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError(
				"'apple' is archived and must be unarchived first",
			),
		});

		const result = await run(
			[
				"food",
				"update",
				"apple",
				"--name",
				"A",
				"--base-unit",
				"g",
				"--kcal",
				"1",
			],
			foods,
		);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: "error: 'apple' is archived and must be unarchived first\n",
		});
	});

	test("help lists the same options as food add", async () => {
		const add = await run(["food", "add", "--help"]);
		const update = await run(["food", "update", "--help"]);

		const options = (help: string) => help.slice(help.indexOf("Options:"));
		expect(update.out).toContain("Usage: nomnom food update <slug> [options]");
		expect(options(update.out)).toBe(options(add.out));
		expect(options(update.out)).toContain("--kcal <number>");
	});

	test("a dry run prints the update and the rename in the conditional", async () => {
		const args = [
			"food",
			"update",
			"apple",
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--kcal",
			"55",
		];
		const renamed: FoodUpdated = {
			slug: "green-apple",
			path: "/data/foods/green-apple.yaml",
			food: { ...foodAdded().food, name: "Green Apple" },
			archived: {
				...foodAdded(),
				food: { ...foodAdded().food, version: 3, archived: true },
			},
			changes: [],
		};

		const update = await run([...args, "--dry-run"]);
		const rename = await run(
			[...args, "--dry-run"],
			createFoodServiceMock({ updated: renamed }),
		);

		expect(update.out).toBe(
			[
				"Would update /data/foods/apple.yaml (version 3)",
				"  kcal: 52 -> 55",
				"  fiber: 2.4 -> (none)",
				"",
				"Dry run: no files were changed.",
				"",
			].join("\n"),
		);
		expect(rename.out).toBe(
			[
				"Would create /data/foods/green-apple.yaml",
				"Would archive /data/foods/apple.yaml (version 3)",
				"",
				"Dry run: no files were changed.",
				"",
			].join("\n"),
		);
	});
});
