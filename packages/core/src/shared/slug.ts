import { NomnomError } from "../errors";

/**
 * The slug of a food or recipe name: NFC-normalised, lowercased, every run of
 * characters other than Unicode letters and digits replaced by `-`, and
 * trimmed of `-`. For a food with barcodes, `-<first barcode>` is appended.
 */
export function slugify(name: string, firstBarcode?: string): string {
	const base = name
		.normalize("NFC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	if (base === "") {
		throw new NomnomError(
			`The name '${name}' has no letters or digits to build a file name from`,
		);
	}
	return firstBarcode === undefined ? base : `${base}-${firstBarcode}`;
}

/** Whether `text` can be a slug: letters, digits and `-` only, so it is safe as a file name. */
export function isSlug(text: string): boolean {
	return /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(text);
}
