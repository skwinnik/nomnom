import { NomnomError } from "../errors";

/**
 * The words of `text` by the slug rule: NFC-normalised, lowercased and split
 * on every run of characters other than Unicode letters and digits. Empty when
 * the text has no letters or digits.
 */
export function slugWords(text: string): string[] {
	return text
		.normalize("NFC")
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word !== "");
}

/**
 * The slug of a food or recipe name: its words (see `slugWords`) joined with
 * `-`. For a food with barcodes, `-<first barcode>` is appended.
 */
export function slugify(name: string, firstBarcode?: string): string {
	const base = slugWords(name).join("-");
	if (base === "") {
		throw new NomnomError(
			`The name '${name}' has no letters or digits to build a file name from`,
		);
	}
	return firstBarcode === undefined ? base : `${base}-${firstBarcode}`;
}

/** Orders slugs by code point, so the order does not depend on the locale. */
export function compareSlugs(a: string, b: string): number {
	const x = [...a];
	const y = [...b];
	for (let i = 0; i < Math.min(x.length, y.length); i++) {
		const diff = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
		if (diff !== 0) return diff;
	}
	return x.length - y.length;
}

/** Whether `text` can be a slug: letters, digits and `-` only, so it is safe as a file name. */
export function isSlug(text: string): boolean {
	return /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(text);
}
