import type { CommandContext } from "../runner";

/** A context with the default config. */
export const defaultContext: CommandContext = {
	config: {
		nutrients: [
			{ id: "kcal", name: "Energy", unit: "kcal", required: true },
			{ id: "protein", name: "Protein", unit: "g", required: false },
			{ id: "fat", name: "Fat", unit: "g", required: false },
			{ id: "carbs", name: "Carbohydrates", unit: "g", required: false },
			{ id: "fiber", name: "Fiber", unit: "g", required: false },
		],
		meals: ["breakfast", "lunch", "dinner", "snack"],
	},
};
