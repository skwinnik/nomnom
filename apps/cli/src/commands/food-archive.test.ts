import { describe, expect, test } from "bun:test";
import { NomnomError } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createFoodServiceMock, foodAdded } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { foodArchive } from "./food-archive";
import { foodUnarchive } from "./food-unarchive";

const archived = {
	...foodAdded(),
	food: { ...foodAdded().food, version: 3, archived: true },
};

async function run(
	argv: string[],
	foods = createFoodServiceMock({ archived }),
) {
	const io = createCapturedIo();
	const code = await runCli({
		argv,
		commands: [foodArchive, foodUnarchive],
		services: { foods },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("archiving does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: foods.archiveCalls };
}

describe("food archive and unarchive", () => {
	test("archive prints the file and the new version", async () => {
		const result = await run(["food", "archive", "apple"]);

		expect(result).toMatchObject({
			code: 0,
			out: "Archived /data/foods/apple.yaml (version 3)\n",
			err: "",
			calls: ["archive apple"],
		});
	});

	test("unarchive prints the file and the new version", async () => {
		const result = await run(["food", "unarchive", "apple"]);

		expect(result).toMatchObject({
			code: 0,
			out: "Unarchived /data/foods/apple.yaml (version 3)\n",
			calls: ["unarchive apple"],
		});
	});

	test("requires the slug", async () => {
		const result = await run(["food", "archive"]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("missing argument <slug>");
		expect(result.calls).toEqual([]);
	});

	test("reports service errors", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError("'apple' is already archived"),
		});

		const result = await run(["food", "archive", "apple"], foods);

		expect(result).toMatchObject({
			code: 1,
			out: "",
			err: "error: 'apple' is already archived\n",
		});
	});

	test("a dry run prints archive and unarchive in the conditional", async () => {
		const archive = await run(["food", "archive", "apple", "--dry-run"]);
		const unarchive = await run(["food", "unarchive", "apple", "--dry-run"]);

		expect(archive).toMatchObject({
			code: 0,
			out: "Would archive /data/foods/apple.yaml (version 3)\n\nDry run: no files were changed.\n",
			calls: ["archive apple"],
		});
		expect(unarchive).toMatchObject({
			code: 0,
			out: "Would unarchive /data/foods/apple.yaml (version 3)\n\nDry run: no files were changed.\n",
			calls: ["unarchive apple"],
		});
	});
});
