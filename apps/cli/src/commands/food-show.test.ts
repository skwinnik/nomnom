import { describe, expect, test } from "bun:test";
import { type FoodShown, NomnomError } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createFoodServiceMock } from "../__mocks__/services";
import { createWritesMock } from "../__mocks__/writes";
import { runCli } from "../runner";
import { foodShow } from "./food-show";

const apple: FoodShown = {
	slug: "apple",
	food: {
		version: 2,
		created: "2026-10-02T08:00:00+03:00",
		name: "Apple",
		barcodes: ["4601234567890"],
		baseUnit: "g",
		per: 100,
		nutrients: new Map([
			["kcal", 52],
			["protein", 0.3],
			["carbs", 14],
			["fiber", 2.4],
		]),
		units: new Map([["medium sized apple", 180]]),
		archived: false,
	},
	latestVersion: 2,
	archived: false,
	nutrients: [
		{ id: "kcal", name: "Energy", unit: "kcal", value: 52 },
		{ id: "protein", name: "Protein", unit: "g", value: 0.3 },
		{ id: "fat", name: "Fat", unit: "g", value: undefined },
		{ id: "carbs", name: "Carbohydrates", unit: "g", value: 14 },
		{ id: "fiber", name: "Fiber", unit: "g", value: 2.4 },
	],
};

async function run(args: string[], shown: FoodShown = apple) {
	const foods = createFoodServiceMock({ shown });
	const io = createCapturedIo();
	const code = await runCli({
		argv: ["food", "show", ...args],
		commands: [foodShow],
		services: { foods },
		io,
		writes: createWritesMock(),
		resolveContext: () => {
			throw new Error("food show does not need the context");
		},
	});
	return { code, out: io.out, err: io.err, calls: foods.showCalls };
}

describe("food show", () => {
	test("prints the latest version as the spec shows it", async () => {
		const result = await run(["apple"]);

		expect(result).toEqual({
			code: 0,
			out: [
				"apple@2  food  Apple",
				"Created: 2026-10-02T08:00:00+03:00",
				"Barcodes: 4601234567890",
				"Per 100 g:",
				"  Energy          52 kcal",
				"  Protein        0.3 g",
				"  Fat              - g",
				"  Carbohydrates   14 g",
				"  Fiber          2.4 g",
				"Units:",
				"  g                   base unit",
				"  medium sized apple  180 g",
				"",
			].join("\n"),
			err: "",
			calls: [{ ref: "apple" }],
		});
	});

	test("an older version names the latest version", async () => {
		const result = await run(["apple@1"], {
			...apple,
			food: { ...apple.food, version: 1 },
		});

		expect(result.calls).toEqual([{ ref: "apple@1" }]);
		expect(result.out).toStartWith(
			"apple@1  food  Apple\nCreated: 2026-10-02T08:00:00+03:00\nLatest version: 2\nBarcodes:",
		);
	});

	test("an archived food says so", async () => {
		const result = await run(["apple"], { ...apple, archived: true });

		expect(result.out).toContain(
			"Created: 2026-10-02T08:00:00+03:00\nArchived: yes\nBarcodes:",
		);
	});

	test("leaves out barcodes and extra units the food doesn't have", async () => {
		const result = await run(["rice"], {
			...apple,
			slug: "rice",
			food: {
				...apple.food,
				name: "Rice",
				barcodes: [],
				per: 50,
				baseUnit: "ml",
				units: new Map(),
			},
		});

		expect(result.out).not.toContain("Barcodes");
		expect(result.out).toContain("Per 50 ml:\n");
		expect(result.out).toEndWith("Units:\n  ml  base unit\n");
	});

	test("passes --barcode to the service", async () => {
		const result = await run(["--barcode", "0034000470693"]);

		expect(result.code).toBe(0);
		expect(result.calls).toEqual([{ barcode: "0034000470693" }]);
	});

	test("passes a slug and a barcode together, for the service to reject", async () => {
		const result = await run(["apple", "--barcode", "4601234567890"]);

		expect(result.calls).toEqual([{ ref: "apple", barcode: "4601234567890" }]);
	});

	test("reports service errors", async () => {
		const foods = createFoodServiceMock({
			error: new NomnomError("There is no food 'pancakes'"),
		});
		const io = createCapturedIo();

		const code = await runCli({
			argv: ["food", "show", "pancakes"],
			commands: [foodShow],
			services: { foods },
			io,
			writes: createWritesMock(),
			resolveContext: () => {
				throw new Error("unused");
			},
		});

		expect(code).toBe(1);
		expect(io.out).toBe("");
		expect(io.err).toBe("error: There is no food 'pancakes'\n");
	});
});
