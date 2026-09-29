import { type ParseArgsOptionsConfig, parseArgs } from "node:util";
import type { OptionSpecs, PositionalSpec } from "./command";

export type ParseResult =
	| { ok: true; values: Record<string, unknown>; positionals: string[] }
	| { ok: false; error: string };

/** Parses a command's arguments with `util.parseArgs`, configured from the same specs that the help shows. */
export function parseCommandArgs(
	args: string[],
	options: OptionSpecs,
	positionals: readonly PositionalSpec[],
): ParseResult {
	let parsed: ReturnType<typeof parseWithTokens>;
	try {
		parsed = parseWithTokens(args, options);
	} catch (error) {
		return { ok: false, error: translateParseError(error) };
	}

	const seen = new Set<string>();
	for (const token of parsed.tokens) {
		if (token.kind !== "option") continue;
		if (seen.has(token.name) && !options[token.name]?.multiple) {
			return {
				ok: false,
				error: `option '--${token.name}' was given more than once`,
			};
		}
		seen.add(token.name);
	}

	for (const [name, spec] of Object.entries(options)) {
		if (spec.required && parsed.values[name] === undefined) {
			return { ok: false, error: `missing required option '--${name}'` };
		}
	}

	const positionalError = checkPositionals(parsed.positionals, positionals);
	if (positionalError) return { ok: false, error: positionalError };

	return { ok: true, values: parsed.values, positionals: parsed.positionals };
}

function parseWithTokens(args: string[], options: OptionSpecs) {
	const config: ParseArgsOptionsConfig = {};
	for (const [name, spec] of Object.entries(options)) {
		const { type, short, multiple } = spec;
		config[name] = { type };
		if (short !== undefined) config[name].short = short;
		if (multiple !== undefined) config[name].multiple = multiple;
		if (spec.default !== undefined) {
			config[name].default = spec.default as
				| string
				| boolean
				| string[]
				| boolean[];
		}
	}
	return parseArgs({
		args,
		options: config,
		strict: true,
		allowPositionals: true,
		tokens: true,
	});
}

function checkPositionals(
	values: string[],
	specs: readonly PositionalSpec[],
): string | undefined {
	const required = specs.filter((spec) => !spec.optional);
	const missing = required[values.length];
	if (values.length < required.length && missing) {
		return `missing argument <${missing.name}>`;
	}
	const variadic = specs.some((spec) => spec.variadic);
	if (!variadic && values.length > specs.length) {
		const extra = values.slice(specs.length).map((value) => `'${value}'`);
		return specs.length === 0
			? `unexpected argument ${extra.join(", ")}: this command takes no arguments`
			: `too many arguments: expected at most ${specs.length}, got ${values.length}`;
	}
	return undefined;
}

/** Turns a `parseArgs` error into a message naming the problem, or keeps its own message for codes it does not know. */
function translateParseError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const code = "code" in error ? error.code : undefined;
	const quoted = /'([^']+)'/.exec(error.message)?.[1];
	// Prefer the long name: "-n, --name <value>" -> "--name".
	const option =
		quoted && (/--[^\s<]+/.exec(quoted)?.[0] ?? /-[^\s,]+/.exec(quoted)?.[0]);

	switch (code) {
		case "ERR_PARSE_ARGS_UNKNOWN_OPTION":
			if (option) return `unknown option '${option}'`;
			break;
		case "ERR_PARSE_ARGS_INVALID_OPTION_VALUE":
			if (option && error.message.includes("argument missing")) {
				return `option '${option}' requires a value`;
			}
			if (option && error.message.includes("does not take an argument")) {
				return `option '${option}' does not take a value`;
			}
			break;
		case "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL":
			if (quoted) return `unexpected argument '${quoted}'`;
			break;
	}
	return error.message;
}
