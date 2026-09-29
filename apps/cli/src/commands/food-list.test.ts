import { describe, expect, test } from "bun:test";
import { NomnomError } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createFoodServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { foodList } from "./food-list";

async function run(foods = createFoodServiceMock(), args: string[] = []) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["food", "list", ...args],
		commands: [foodList],
		services: { foods },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("food list does not need the context");
		},
	});
	return { code, out: io.out, err: io.err };
}

describe("food list", () => {
	test("prints one aligned line per food", async () => {
		const foods = createFoodServiceMock({
			list: [
				{ kind: "food", slug: "apple", version: 2, name: "Apple" },
				{
					kind: "food",
					slug: "greek-yogurt-2-4601234567890",
					version: 1,
					name: "Greek Yogurt 2%",
				},
			],
		});

		expect(await run(foods)).toEqual({
			code: 0,
			out: [
				"apple@2                         food  Apple",
				"greek-yogurt-2-4601234567890@1  food  Greek Yogurt 2%",
				"",
			].join("\n"),
			err: "",
		});
	});

	test("prints No foods when there are none", async () => {
		expect(await run()).toEqual({ code: 0, out: "No foods\n", err: "" });
	});

	test("reports a broken file with its problems", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError("/data/foods/rice.yaml is not valid YAML", [
				{ file: "/data/foods/rice.yaml", message: "not a YAML stream" },
			]),
		});

		expect(await run(foods)).toEqual({
			code: 1,
			out: "",
			err: [
				"error: /data/foods/rice.yaml is not valid YAML",
				"/data/foods/rice.yaml: not a YAML stream",
				"",
			].join("\n"),
		});
	});

	test("takes no arguments", async () => {
		const result = await run(createFoodServiceMock(), ["apple"]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("this command takes no arguments");
	});
});
