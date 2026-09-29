import { describe, expect, test } from "bun:test";
import { NomnomError } from "@nomnom/core";
import { defaultContext } from "../__mocks__/context";
import { createCapturedIo } from "../__mocks__/io";
import { createFoodServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { foodAdd } from "./food-add";

async function run(args: string[], foods = createFoodServiceMock()) {
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["food", "add", ...args],
		commands: [foodAdd],
		services: { foods },
		io,
		writes: createWritesMock(),
		resolveContext: () => defaultContext,
	});
	return { code, out: io.out, err: io.err, calls: foods.calls };
}

describe("food add", () => {
	test("passes every value to the service and prints the created path", async () => {
		const result = await run([
			"--name",
			"Apple",
			"--base-unit",
			"g",
			"--per",
			"100",
			"--kcal",
			"52",
			"--protein",
			"0.3",
			"--units",
			"small sized apple=134",
			"--units",
			"100g=100",
			"--barcode",
			"0123456789012",
		]);

		expect(result).toMatchObject({
			code: 0,
			out: "Created /data/foods/apple.yaml\n",
			err: "",
		});
		expect(result.calls).toEqual([
			{
				name: "Apple",
				baseUnit: "g",
				per: "100",
				nutrients: { kcal: "52", protein: "0.3" },
				units: ["small sized apple=134", "100g=100"],
				barcodes: ["0123456789012"],
			},
		]);
	});

	test("a minimal food uses the default per and no units or barcodes", async () => {
		const result = await run([
			"--name",
			"Rice",
			"--base-unit",
			"g",
			"--kcal",
			"360",
		]);

		expect(result.calls).toEqual([
			{
				name: "Rice",
				baseUnit: "g",
				per: "100",
				nutrients: { kcal: "360" },
				units: [],
				barcodes: [],
			},
		]);
	});

	test("a missing required nutrient fails naming it", async () => {
		const result = await run([
			"--name",
			"Rice",
			"--base-unit",
			"g",
			"--protein",
			"7",
		]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("--kcal");
		expect(result.calls).toEqual([]);
	});

	test("an unknown nutrient flag fails naming it", async () => {
		const result = await run([
			"--name",
			"Rice",
			"--base-unit",
			"g",
			"--kcal",
			"360",
			"--protien",
			"7",
		]);

		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown option '--protien'");
		expect(result.calls).toEqual([]);
	});

	test("a negative value can be given and is left to the service to reject", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError("'kcal' must not be negative, got -5"),
		});

		const result = await run(
			["--name", "Rice", "--base-unit", "g", "--kcal=-5"],
			foods,
		);

		expect(foods.calls[0]?.nutrients).toEqual({ kcal: "-5" });
		expect(result.code).toBe(1);
		expect(result.err).toBe("error: 'kcal' must not be negative, got -5\n");
		expect(result.out).toBe("");
	});

	test.each([
		["a unit name containing =", ["--units", "a=b=5"], { units: ["a=b=5"] }],
		[
			"a unit name with a hash",
			["--units", "can #2=400"],
			{ units: ["can #2=400"] },
		],
		[
			"duplicate units",
			["--units", "cup=240", "--units", "cup=250"],
			{ units: ["cup=240", "cup=250"] },
		],
		["a non-numeric barcode", ["--barcode", "abc"], { barcodes: ["abc"] }],
	])("passes %s through unchanged", async (_name, args, expected) => {
		const result = await run([
			"--name",
			"X",
			"--base-unit",
			"g",
			"--kcal",
			"1",
			...args,
		]);

		expect(result.calls[0]).toMatchObject(expected);
	});

	test("service errors such as an existing food are reported without a stack trace", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError(
				"'apple' already exists: it is already used by a food",
			),
		});

		const result = await run(
			["--name", "Apple", "--base-unit", "g", "--kcal", "52"],
			foods,
		);

		expect(result.code).toBe(1);
		expect(result.err).toBe(
			"error: 'apple' already exists: it is already used by a food\n",
		);
	});

	test("help lists every nutrient from the config and marks required ones", async () => {
		const result = await run(["--help"]);

		expect(result.code).toBe(0);
		expect(result.out).toContain("--kcal <number>");
		expect(result.out).toContain(
			"Energy (kcal) per --per base units (required)",
		);
		expect(result.out).toContain("--fiber <number>");
		expect(result.out).toContain("--units <name=amount>");
		expect(result.out).toContain("(repeatable)");
		expect(result.out).toContain("(default: 100)");
	});

	test("a dry run makes the same call and prints the path in the conditional", async () => {
		const args = ["--name", "Rice", "--base-unit", "g", "--kcal", "360"];

		const real = await run(args);
		const dry = await run([...args, "--dry-run"]);

		expect(real.out).toBe("Created /data/foods/apple.yaml\n");
		expect(dry).toMatchObject({
			code: 0,
			out: "Would create /data/foods/apple.yaml\n\nDry run: no files were changed.\n",
			calls: real.calls,
		});
	});
});
