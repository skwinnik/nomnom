import { NomnomError } from "../errors";

/** Parses a barcode as given: trimmed, digits only. The digits are kept as they are. */
export function parseBarcode(raw: string): string {
	const barcode = raw.trim();
	if (!/^\d+$/.test(barcode)) {
		throw new NomnomError(`A barcode must contain digits only, got '${raw}'`);
	}
	return barcode;
}

/**
 * The form barcodes are compared by, following Open Food Facts: leading zeros
 * are removed, then 1 to 7 digits are padded to 8 and 9 to 12 digits to 13, so
 * a UPC-A code and its EAN-13 form are the same barcode. Other lengths are
 * kept. Zeros only give `00000000`.
 */
export function normaliseBarcode(barcode: string): string {
	const digits = barcode.replace(/^0+/, "");
	if (digits.length < 8) return digits.padStart(8, "0");
	if (digits.length >= 9 && digits.length <= 12) {
		return digits.padStart(13, "0");
	}
	return digits;
}
