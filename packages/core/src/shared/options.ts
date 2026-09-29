/**
 * Names of the options that commands declare themselves. Nutrient ids become
 * options too (`--kcal`), so config validation rejects ids from this list.
 */
export const BUILT_IN_OPTION_NAMES: readonly string[] = [
	"help",
	"name",
	"base-unit",
	"per",
	"units",
	"barcode",
	"ingredient",
	"servings",
	"yield",
	"inline",
	"date",
	"entry",
	"entries",
	"json",
];
