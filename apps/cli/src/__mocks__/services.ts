import type {
	DayLogService,
	FoodAdded,
	FoodAddInput,
	FoodService,
	Logged,
	LogInput,
	NomnomError,
	RecipeAdded,
	RecipeAddInput,
	RecipeService,
} from "@nomnom/core";

export interface Recorded<I> {
	/** Every input the mock was called with. */
	readonly calls: I[];
}

/** A food service that records its inputs and returns `result`, or throws `error`. */
export function createFoodServiceMock(
	outcome: { result?: FoodAdded; error?: NomnomError } = {},
): FoodService & Recorded<FoodAddInput> {
	const calls: FoodAddInput[] = [];
	return {
		calls,
		async add(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			return outcome.result ?? foodAdded();
		},
	};
}

export function foodAdded(slug = "apple"): FoodAdded {
	return {
		slug,
		path: `/data/foods/${slug}.yaml`,
		food: {
			version: 1,
			created: "2026-09-29T20:10:00+03:00",
			name: "Apple",
			barcodes: [],
			baseUnit: "g",
			per: 100,
			nutrients: new Map([["kcal", 52]]),
			units: new Map(),
			archived: false,
		},
	};
}

/** A recipe service that records its inputs and returns `result`, or throws `error`. */
export function createRecipeServiceMock(
	outcome: { result?: RecipeAdded; error?: NomnomError } = {},
): RecipeService & Recorded<RecipeAddInput> {
	const calls: RecipeAddInput[] = [];
	return {
		calls,
		async add(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			if (!outcome.result) throw new Error("no result configured");
			return outcome.result;
		},
	};
}

/** A day log service that records its inputs and returns `result`, or throws `error`. */
export function createDayLogServiceMock(
	outcome: { result?: Partial<Logged>; error?: NomnomError } = {},
): DayLogService & Recorded<LogInput> {
	const calls: LogInput[] = [];
	return {
		calls,
		async log(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			return {
				path: "/data/logs/2026/2026-09-29.nom",
				date: "2026-09-29",
				line: "apple@2 1 medium sized apple",
				warnings: [],
				...outcome.result,
			};
		},
	};
}
