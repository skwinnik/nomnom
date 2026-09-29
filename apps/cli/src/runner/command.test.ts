import { expect, expectTypeOf, test } from "bun:test";
import { type Command, type CommandEnv, defineCommand } from "./command";

test("values are typed from the option specs", () => {
	defineCommand({
		name: ["food", "add"],
		summary: "Add a food",
		options: {
			name: { type: "string", required: true, description: "Display name" },
			brand: { type: "string", description: "Brand" },
			barcode: { type: "string", multiple: true, description: "Barcode" },
			dry: { type: "boolean", description: "Dry run" },
			limit: { type: "string", default: "10", description: "Limit" },
		},
		run: ({ values, positionals }) => {
			expectTypeOf(values.name).toEqualTypeOf<string>();
			expectTypeOf(values.brand).toEqualTypeOf<string | undefined>();
			expectTypeOf(values.barcode).toEqualTypeOf<string[] | undefined>();
			expectTypeOf(values.dry).toEqualTypeOf<boolean | undefined>();
			expectTypeOf(values.limit).toEqualTypeOf<string>();
			expectTypeOf(positionals).toEqualTypeOf<string[]>();
			// @ts-expect-error undeclared options are not in `values`
			values.colour;
		},
	});
});

test("values are typed from options that depend on the context", () => {
	defineCommand({
		name: ["log"],
		summary: "Log",
		options: () => ({
			day: { type: "string", required: true, description: "Day" },
		}),
		run: ({ values }) => {
			expectTypeOf(values.day).toEqualTypeOf<string>();
			// @ts-expect-error undeclared options are not in `values`
			values.colour;
		},
	});
});

test("a command without options has no values", () => {
	defineCommand({
		name: ["status"],
		summary: "Status",
		run: ({ values }) => {
			expectTypeOf(values).toEqualTypeOf<Record<never, never>>();
		},
	});
});

interface Foods {
	count(): number;
}
interface Services {
	foods: Foods;
	recipes: { count(): number };
}

test("a command declares the services it uses", () => {
	const command = defineCommand({
		name: ["food", "count"],
		summary: "Count foods",
		run: (_args, { services }: CommandEnv<Pick<Services, "foods">>) => {
			services.foods.count();
		},
	});

	expectTypeOf(command).toEqualTypeOf<Command<Pick<Services, "foods">>>();
	// A runner with all services accepts it...
	const all: Command<Services>[] = [command];
	// ...but a runner without the services it needs does not.
	// @ts-expect-error `foods` is missing
	const none: Command<Pick<Services, "recipes">>[] = [command];

	expect([all, none]).toHaveLength(2);
});

test("defineCommand fills in empty positionals and options", () => {
	const command = defineCommand({ name: ["x"], summary: "X", run: () => {} });

	expect(command.positionals).toEqual([]);
	expect(command.options).toEqual({});
});

test("defineCommand marks a command as writing only when it says so", () => {
	const reads = defineCommand({ name: ["x"], summary: "X", run: () => {} });
	const writes = defineCommand({
		name: ["y"],
		summary: "Y",
		writes: true,
		run: () => {},
	});

	expect(reads.writes).toBe(false);
	expect(writes.writes).toBe(true);
});

test("defineCommand refuses a command that declares its own dry-run", () => {
	const dryRun = { type: "boolean", description: "Dry run" } as const;

	expect(() =>
		defineCommand({
			name: ["x"],
			summary: "X",
			options: { "dry-run": dryRun },
			run: () => {},
		}),
	).toThrow("'x' declares 'dry-run': declare `writes: true` instead");

	const contextual = defineCommand({
		name: ["y"],
		summary: "Y",
		options: () => ({ "dry-run": dryRun }),
		run: () => {},
	});
	expect(() =>
		typeof contextual.options === "function"
			? contextual.options({ config: { nutrients: [], meals: [] } })
			: undefined,
	).toThrow("'y' declares 'dry-run'");
});
