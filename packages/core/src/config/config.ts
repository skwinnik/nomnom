export interface Nutrient {
	/** Used in options (`--kcal`) and log files (`kcal=800`). */
	readonly id: string;
	/** Display name. */
	readonly name: string;
	/** Display unit. */
	readonly unit: string;
	/** Whether every food and inline log entry must give a value. */
	readonly required: boolean;
}

export interface Config {
	/** The nutrient catalog, in display order. */
	readonly nutrients: readonly Nutrient[];
	/** Meal ids, in the order of a day. */
	readonly meals: readonly string[];
}

export const NUTRIENT_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MEAL_ID_PATTERN = /^[a-z0-9_-]+$/;

/** Written to `config.yaml` when it is missing. */
export const DEFAULT_CONFIG_TEXT = `# nomnom configuration
#
# nutrients: the nutrient catalog, in display order.
#   id        used in options (--kcal) and log files (kcal=800): a lowercase
#             letter followed by lowercase letters, digits or underscores
#   name      display name
#   unit      display unit
#   required  true when every food and inline log entry must give a value
#
# meals: the meals of a day, in order: lowercase letters, digits, - and _

nutrients:
  - id: kcal
    name: Energy
    unit: kcal
    required: true
  - id: protein
    name: Protein
    unit: g
  - id: fat
    name: Fat
    unit: g
  - id: carbs
    name: Carbohydrates
    unit: g
  - id: fiber
    name: Fiber
    unit: g

meals:
  - breakfast
  - lunch
  - dinner
  - snack
`;
