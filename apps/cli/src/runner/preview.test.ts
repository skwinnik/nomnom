import { expect, test } from "bun:test";
import { formatPreview } from "./preview";

const lines = (...all: string[]) => all.map((line) => `${line}\n`).join("");

test("a new file lists every line as added, empty ones without trailing spaces", () => {
	expect(
		formatPreview({
			path: "/data/foods/apple.yaml",
			before: undefined,
			after: "name: Apple\n\nkcal: 52\n",
		}),
	).toBe(
		lines(
			"/data/foods/apple.yaml (new file)",
			"+ name: Apple",
			"+",
			"+ kcal: 52",
		),
	);
});

test("an append shows the last two lines before it", () => {
	expect(
		formatPreview({
			path: "/f",
			before: "a\nb\nc\n",
			after: "a\nb\nc\nd\ne\n",
		}),
	).toBe(lines("/f", "  b", "  c", "+ d", "+ e"));
});

test("an append after a file without a final line break", () => {
	expect(
		formatPreview({ path: "/f", before: "a\nb\nc", after: "a\nb\nc\nd\n" }),
	).toBe(lines("/f", "  b", "  c", "+ d"));
});

test("an insertion in the middle shows two lines on each side", () => {
	const before = lines(
		"[breakfast]",
		"oats@2 60 g",
		"milk@1 200 ml",
		"",
		"[lunch]",
		'"soup" kcal=300',
	);
	const after = lines(
		"[breakfast]",
		"oats@2 60 g",
		"milk@1 200 ml",
		"apple@2 150 g",
		"",
		"[lunch]",
		'"soup" kcal=300',
	);

	expect(formatPreview({ path: "/day.nom", before, after })).toBe(
		lines(
			"/day.nom",
			"  oats@2 60 g",
			"  milk@1 200 ml",
			"+ apple@2 150 g",
			"",
			"  [lunch]",
		),
	);
});

test("an insertion near the start and the end shows the lines there are", () => {
	expect(
		formatPreview({ path: "/f", before: "a\nb\nc\n", after: "a\nx\nb\nc\n" }),
	).toBe(lines("/f", "  a", "+ x", "  b", "  c"));
	expect(
		formatPreview({ path: "/f", before: "a\nb\nc\n", after: "a\nb\nx\nc\n" }),
	).toBe(lines("/f", "  a", "  b", "+ x", "  c"));
});

test("a replaced line is removed and added", () => {
	expect(
		formatPreview({
			path: "/f",
			before: "a\nb\nc\nd\ne\n",
			after: "a\nb\nC\nd\ne\n",
		}),
	).toBe(lines("/f", "  a", "  b", "- c", "+ C", "  d", "  e"));
});
