import type {
	DayLogService,
	FoodAdded,
	FoodAddInput,
	FoodService,
	FoodShowInput,
	FoodShown,
	ItemSummary,
	Logged,
	LogInput,
	NomnomError,
	RecipeAdded,
	RecipeAddInput,
	RecipeService,
	RecipeShown,
	Report,
	ReportInput,
	ReportService,
	SearchService,
} from "@nomnom/core";

export interface Recorded<I> {
	/** Every input the mock was called with. */
	readonly calls: I[];
}

/**
 * A food service that records its inputs and returns the configured results,
 * or throws `error` from every method.
 */
export function createFoodServiceMock(
	outcome: {
		result?: FoodAdded;
		list?: ItemSummary[];
		shown?: FoodShown;
		error?: NomnomError;
	} = {},
): FoodService & Recorded<FoodAddInput> & { showCalls: FoodShowInput[] } {
	const calls: FoodAddInput[] = [];
	const showCalls: FoodShowInput[] = [];
	return {
		calls,
		showCalls,
		async add(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			return outcome.result ?? foodAdded();
		},
		async list() {
			if (outcome.error) throw outcome.error;
			return outcome.list ?? [];
		},
		async show(input) {
			showCalls.push(input);
			if (outcome.error) throw outcome.error;
			if (!outcome.shown) throw new Error("no food to show configured");
			return outcome.shown;
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

/**
 * A recipe service that records its inputs and returns the configured results,
 * or throws `error` from every method.
 */
export function createRecipeServiceMock(
	outcome: {
		result?: RecipeAdded;
		list?: ItemSummary[];
		shown?: RecipeShown;
		error?: NomnomError;
	} = {},
): RecipeService & Recorded<RecipeAddInput> & { showCalls: string[] } {
	const calls: RecipeAddInput[] = [];
	const showCalls: string[] = [];
	return {
		calls,
		showCalls,
		async add(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			if (!outcome.result) throw new Error("no result configured");
			return outcome.result;
		},
		async list() {
			if (outcome.error) throw outcome.error;
			return outcome.list ?? [];
		},
		async show(ref) {
			showCalls.push(ref);
			if (outcome.error) throw outcome.error;
			if (!outcome.shown) throw new Error("no recipe to show configured");
			return outcome.shown;
		},
	};
}

/** A search service that records its queries and returns `results`, or throws `error`. */
export function createSearchServiceMock(
	outcome: { results?: ItemSummary[]; error?: NomnomError } = {},
): SearchService & Recorded<string> {
	const calls: string[] = [];
	return {
		calls,
		async search(text) {
			calls.push(text);
			if (outcome.error) throw outcome.error;
			return outcome.results ?? [];
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

/** A report service that records its inputs and returns `result`, or throws `error`. */
export function createReportServiceMock(
	outcome: { result?: Report; error?: NomnomError } = {},
): ReportService & Recorded<ReportInput> {
	const calls: ReportInput[] = [];
	return {
		calls,
		async report(input) {
			calls.push(input);
			if (outcome.error) throw outcome.error;
			if (!outcome.result) throw new Error("no result configured");
			return outcome.result;
		},
	};
}
