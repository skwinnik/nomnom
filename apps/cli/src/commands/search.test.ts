import { describe, expect, test } from "bun:test";
import { NomnomError } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createSearchServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { search } from "./search";

async function run(args: string[], service = createSearchServiceMock()) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["search", ...args],
		commands: [search],
		services: { search: service },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("search does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: service.calls };
}

describe("search", () => {
	test("prints foods and recipes together, aligned", async () => {
		const service = createSearchServiceMock({
			results: [
				{
					kind: "food",
					slug: "greek-yogurt-2-4601234567890",
					version: 1,
					name: "Greek Yogurt 2%",
				},
				{
					kind: "recipe",
					slug: "yogurt-bowl",
					version: 2,
					name: "Yogurt Bowl",
				},
			],
		});

		expect(await run(["yogurt"], service)).toEqual({
			code: 0,
			out: [
				"greek-yogurt-2-4601234567890@1  food    Greek Yogurt 2%",
				"yogurt-bowl@2                   recipe  Yogurt Bowl",
				"",
			].join("\n"),
			err: "",
			calls: ["yogurt"],
		});
	});

	test("joins several words into one query", async () => {
		expect((await run(["greek", "yog"])).calls).toEqual(["greek yog"]);
		expect((await run(["greek yog"])).calls).toEqual(["greek yog"]);
	});

	test("says when nothing matches", async () => {
		expect(await run(["xyz"])).toMatchObject({
			code: 0,
			out: "No foods or recipes match 'xyz'\n",
			err: "",
		});
	});

	test("reports a query the service rejects", async () => {
		const service = createSearchServiceMock({
			error: new NomnomError(
				"The search '%%' has no letters or digits to search for",
			),
		});

		expect(await run(["%%"], service)).toMatchObject({
			code: 1,
			out: "",
			err: "error: The search '%%' has no letters or digits to search for\n",
		});
	});

	test("needs some text", async () => {
		const result = await run([]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("missing argument <text>");
	});
});
