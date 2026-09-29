import type {
	CheckResult,
	CheckService,
	DayLogService,
	FoodAdded,
	FoodAddInput,
	FoodArchived,
	FoodService,
	FoodShowInput,
	FoodShown,
	FoodUpdated,
	ItemSummary,
	Logged,
	LogInput,
	NomnomError,
	RecipeAdded,
	RecipeAddInput,
	RecipeArchived,
	RecipeService,
	RecipeShown,
	RecipeUpdated,
	Report,
	ReportInput,
	ReportService,
	SearchService,
} from "@nomnom/core";

export interface Recorded<I> {
	/** Every input the mock was called with. */
	readonly calls: I[];
}

/** The calls of `update`, `archive` and `unarchive`, in order. */
export interface RecordedVersions<I> {
	readonly updateCalls: { slug: string; input: I }[];
	/** `archive <slug>` or `unarchive <slug>` each. */
	readonly archiveCalls: string[];
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
		updated?: FoodUpdated;
		archived?: FoodArchived;
		error?: NomnomError;
	} = {},
): FoodService &
	Recorded<FoodAddInput> &
	RecordedVersions<FoodAddInput> & { showCalls: FoodShowInput[] } {
	const calls: FoodAddInput[] = [];
	const showCalls: FoodShowInput[] = [];
	const updateCalls: { slug: string; input: FoodAddInput }[] = [];
	const archiveCalls: string[] = [];
	const setArchived = async (action: string, slug: string) => {
		archiveCalls.push(`${action} ${slug}`);
		if (outcome.error) throw outcome.error;
		if (!outcome.archived) throw new Error("no archived result configured");
		return outcome.archived;
	};
	return {
		calls,
		showCalls,
		updateCalls,
		archiveCalls,
		async update(slug, input) {
			updateCalls.push({ slug, input });
			if (outcome.error) throw outcome.error;
			if (!outcome.updated) throw new Error("no update result configured");
			return outcome.updated;
		},
		archive: (slug) => setArchived("archive", slug),
		unarchive: (slug) => setArchived("unarchive", slug),
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
		updated?: RecipeUpdated;
		archived?: RecipeArchived;
		error?: NomnomError;
	} = {},
): RecipeService &
	Recorded<RecipeAddInput> &
	RecordedVersions<RecipeAddInput> & { showCalls: string[] } {
	const calls: RecipeAddInput[] = [];
	const showCalls: string[] = [];
	const updateCalls: { slug: string; input: RecipeAddInput }[] = [];
	const archiveCalls: string[] = [];
	const setArchived = async (action: string, slug: string) => {
		archiveCalls.push(`${action} ${slug}`);
		if (outcome.error) throw outcome.error;
		if (!outcome.archived) throw new Error("no archived result configured");
		return outcome.archived;
	};
	return {
		calls,
		showCalls,
		updateCalls,
		archiveCalls,
		async update(slug, input) {
			updateCalls.push({ slug, input });
			if (outcome.error) throw outcome.error;
			if (!outcome.updated) throw new Error("no update result configured");
			return outcome.updated;
		},
		archive: (slug) => setArchived("archive", slug),
		unarchive: (slug) => setArchived("unarchive", slug),
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
				lines: ["apple@2 1 medium sized apple"],
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

/** A check service that returns `result`, or throws `error`, and counts its calls. */
export function createCheckServiceMock(
	outcome: { result?: Partial<CheckResult>; error?: NomnomError } = {},
): CheckService & { readonly calls: number } {
	let calls = 0;
	return {
		get calls() {
			return calls;
		},
		async check() {
			calls++;
			if (outcome.error) throw outcome.error;
			return {
				errors: [],
				warnings: [],
				checked: { foods: 0, recipes: 0, days: 0 },
				...outcome.result,
			};
		},
	};
}
