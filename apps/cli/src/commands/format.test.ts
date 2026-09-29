import { describe, expect, test } from "bun:test";
import {
	formatArchived,
	formatChanges,
	formatColumns,
	formatItems,
	formatNutrients,
	formatStoredNutrients,
	formatUpdated,
	writeVerb,
} from "./format";

describe("formatItems", () => {
	test("aligns the slug@version and kind columns, the name last and in full", () => {
		expect(
			formatItems([
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
			]),
		).toBe(
			[
				"greek-yogurt-2-4601234567890@1  food    Greek Yogurt 2%",
				"yogurt-bowl@2                   recipe  Yogurt Bowl",
				"",
			].join("\n"),
		);
	});

	test("pads only to the widest value in the output", () => {
		expect(
			formatItems([{ kind: "food", slug: "apple", version: 2, name: "Apple" }]),
		).toBe("apple@2  food  Apple\n");
	});
});

describe("formatColumns", () => {
	test("indents lines and leaves no trailing spaces", () => {
		expect(
			formatColumns(
				[
					["g", "base unit"],
					["medium sized apple", "180 g"],
					["serving", ""],
				],
				"  ",
			),
		).toBe(
			[
				"  g                   base unit",
				"  medium sized apple  180 g",
				"  serving",
				"",
			].join("\n"),
		);
	});
});

describe("formatStoredNutrients", () => {
	test("prints values as stored, and - when absent", () => {
		const nutrient = (name: string, unit: string, value?: number) => ({
			id: name.toLowerCase(),
			name,
			unit,
			value,
		});

		expect(
			formatStoredNutrients("Per 100 g", [
				nutrient("Energy", "kcal", 52),
				nutrient("Protein", "g", 0.3),
				nutrient("Fat", "g"),
				nutrient("Carbohydrates", "g", 14),
				nutrient("Fiber", "g", 2.4),
			]),
		).toBe(
			[
				"Per 100 g:",
				"  Energy          52 kcal",
				"  Protein        0.3 g",
				"  Fat              - g",
				"  Carbohydrates   14 g",
				"  Fiber          2.4 g",
				"",
			].join("\n"),
		);
	});
});

describe("formatNutrients", () => {
	test("rounds to one decimal place", () => {
		expect(
			formatNutrients("Per serving", [
				{ id: "kcal", name: "Energy", unit: "kcal", value: 136.255 },
				{ id: "fat", name: "Fat", unit: "g", value: 0 },
			]),
		).toBe("Per serving:\n  Energy  136.3 kcal\n  Fat       0.0 g\n");
	});
});

describe("writeVerb", () => {
	test("keeps the verb for a real run and puts it in the conditional for a dry run", () => {
		const verbs = ["Created", "Updated", "Archived", "Unarchived"] as const;

		expect(verbs.map((verb) => writeVerb(verb, false))).toEqual([...verbs]);
		expect(verbs.map((verb) => writeVerb(verb, true))).toEqual([
			"Would create",
			"Would update",
			"Would archive",
			"Would unarchive",
		]);
	});
});

describe("formatUpdated", () => {
	test("names the file and the new version", () => {
		expect(formatUpdated("/data/foods/apple.yaml", 3, undefined, false)).toBe(
			"Updated /data/foods/apple.yaml (version 3)\n",
		);
		expect(formatUpdated("/data/foods/apple.yaml", 3, undefined, true)).toBe(
			"Would update /data/foods/apple.yaml (version 3)\n",
		);
	});

	test("after a rename, names the created file and the archived one", () => {
		const archived = { path: "/data/foods/apple.yaml", version: 3 };

		expect(
			formatUpdated("/data/foods/green-apple.yaml", 1, archived, false),
		).toBe(
			"Created /data/foods/green-apple.yaml\nArchived /data/foods/apple.yaml (version 3)\n",
		);
		expect(
			formatUpdated("/data/foods/green-apple.yaml", 1, archived, true),
		).toBe(
			"Would create /data/foods/green-apple.yaml\nWould archive /data/foods/apple.yaml (version 3)\n",
		);
	});
});

describe("formatArchived", () => {
	test("names the file and the version, archived or unarchived", () => {
		const path = "/data/foods/apple.yaml";

		expect(formatArchived(path, 3, { archived: true, dryRun: false })).toBe(
			`Archived ${path} (version 3)\n`,
		);
		expect(formatArchived(path, 3, { archived: true, dryRun: true })).toBe(
			`Would archive ${path} (version 3)\n`,
		);
		expect(formatArchived(path, 4, { archived: false, dryRun: false })).toBe(
			`Unarchived ${path} (version 4)\n`,
		);
		expect(formatArchived(path, 4, { archived: false, dryRun: true })).toBe(
			`Would unarchive ${path} (version 4)\n`,
		);
	});
});

describe("formatChanges", () => {
	test("prints one indented line per change", () => {
		expect(
			formatChanges([
				{ kind: "changed", field: "name", before: "Apple", after: "APPLE" },
				{
					kind: "changed",
					field: "nutrients",
					key: "kcal",
					before: "52",
					after: "55",
				},
				{ kind: "changed", field: "nutrients", key: "fiber", before: "2.4" },
				{
					kind: "changed",
					field: "units",
					key: "small sized apple",
					before: "134",
				},
				{ kind: "changed", field: "units", key: "bowl", after: "350" },
				{ kind: "removed", field: "barcodes", item: "4600000000001" },
				{
					kind: "added",
					field: "ingredients",
					item: "carrot@2 2 medium carrot",
				},
				{ kind: "reordered", field: "barcodes" },
			]),
		).toBe(
			[
				"  name: Apple -> APPLE",
				"  kcal: 52 -> 55",
				"  fiber: 2.4 -> (none)",
				"  units.small sized apple: 134 -> (none)",
				"  units.bowl: (none) -> 350",
				"  barcodes: removed 4600000000001",
				"  ingredients: added carrot@2 2 medium carrot",
				"  barcodes: order changed",
				"",
			].join("\n"),
		);
	});

	test("is empty without changes", () => {
		expect(formatChanges([])).toBe("");
	});
});
