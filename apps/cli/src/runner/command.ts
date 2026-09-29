/**
 * An option as a command declares it. `type`, `short`, `multiple` and `default`
 * are passed to `util.parseArgs`; the other fields only feed the help.
 */
export interface OptionSpec {
	type: "string" | "boolean";
	short?: string;
	multiple?: boolean;
	default?: string | boolean | readonly string[] | readonly boolean[];
	description: string;
	required?: boolean;
	/** Placeholder shown in help for a value option, as in `--barcode <digits>`. */
	valueName?: string;
}

export type OptionSpecs = Record<string, OptionSpec>;

export interface PositionalSpec {
	name: string;
	description: string;
	optional?: boolean;
	/** Accepts any number of values. Only the last positional can be variadic. */
	variadic?: boolean;
}

/** Runtime data that option sets may depend on. Resolved lazily by the entry point. */
// biome-ignore lint/complexity/noBannedTypes: members arrive with the features that need them
export type CommandContext = {};

/** Output streams. `text` is written as given; include line breaks yourself. */
export interface Io {
	stdout(text: string): void;
	stderr(text: string): void;
}

export interface CommandEnv<S> {
	services: S;
	io: Io;
}

type OptionValue<Spec extends OptionSpec> = Spec extends { multiple: true }
	? Scalar<Spec>[]
	: Scalar<Spec>;
type Scalar<Spec extends OptionSpec> = Spec["type"] extends "string"
	? string
	: boolean;
type AlwaysSet<Spec extends OptionSpec> = Spec extends { required: true }
	? true
	: Spec extends { default: NonNullable<OptionSpec["default"]> }
		? true
		: false;

/** Parsed option values, typed from the specs: options that are required or have a default are always set. */
export type OptionValues<O extends OptionSpecs> = Simplify<
	{
		[K in keyof O as AlwaysSet<O[K]> extends true ? K : never]: OptionValue<
			O[K]
		>;
	} & {
		[K in keyof O as AlwaysSet<O[K]> extends true ? never : K]?: OptionValue<
			O[K]
		>;
	}
>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};

export interface ParsedArgs<O extends OptionSpecs> {
	values: OptionValues<O>;
	positionals: string[];
}

export interface CommandDefinition<O extends OptionSpecs, S> {
	/** The full name, one entry per word: `["food", "add"]`. */
	name: readonly string[];
	summary: string;
	positionals?: readonly PositionalSpec[];
	/** Static options, or a function of the runtime context for options that depend on it. */
	options?: O | ((ctx: CommandContext) => O);
	run: (args: ParsedArgs<O>, env: CommandEnv<S>) => void | Promise<void>;
}

/** What the runner knows about a command apart from how to run it. */
export interface CommandInfo {
	readonly name: readonly string[];
	readonly summary: string;
	readonly positionals: readonly PositionalSpec[];
	readonly options: OptionSpecs | ((ctx: CommandContext) => OptionSpecs);
}

/**
 * A command as the runner sees it: option values are no longer tied to the
 * specs, but the services it needs still are, so a command list only accepts
 * commands whose services the runner can provide.
 */
export interface Command<S> extends CommandInfo {
	readonly run: (
		args: { values: Record<string, unknown>; positionals: string[] },
		env: CommandEnv<S>,
	) => void | Promise<void>;
}

/**
 * Declares a command. Its definition is the only source of the arguments the
 * command accepts and of its help. Declare the services it uses by annotating
 * `run`'s second parameter, for example `CommandEnv<Pick<Services, "foods">>`.
 */
export function defineCommand<
	const O extends OptionSpecs = Record<never, never>,
	S = unknown,
>(definition: CommandDefinition<O, S>): Command<S> {
	return {
		name: definition.name,
		summary: definition.summary,
		positionals: definition.positionals ?? [],
		options: definition.options ?? {},
		// The runner parses values from the same specs, so they match `O`.
		run: (args, env) => definition.run(args as ParsedArgs<O>, env),
	};
}
