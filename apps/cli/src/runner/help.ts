import type {
	CommandInfo,
	OptionSpec,
	OptionSpecs,
	PositionalSpec,
} from "./command";

export const PROGRAM = "nomnom";

export function fullName(command: CommandInfo): string {
	return [PROGRAM, ...command.name].join(" ");
}

export function renderGlobalUsage(commands: readonly CommandInfo[]): string {
	return [
		`Usage: ${PROGRAM} <command> [options]`,
		"",
		"Commands:",
		...renderCommandList(commands, []),
		"",
		`Run '${PROGRAM} <command> --help' for help on a command.`,
		"",
	].join("\n");
}

export function renderGroupList(
	commands: readonly CommandInfo[],
	group: readonly string[],
): string {
	const prefix = [PROGRAM, ...group].join(" ");
	return [
		`Usage: ${prefix} <command> [options]`,
		"",
		"Commands:",
		...renderCommandList(commands, group),
		"",
		`Run '${prefix} <command> --help' for help on a command.`,
		"",
	].join("\n");
}

export function renderCommandHelp(
	command: CommandInfo,
	options: OptionSpecs,
): string {
	const lines = [
		command.summary,
		"",
		`Usage: ${[fullName(command), ...command.positionals.map(positionalUsage), "[options]"].join(" ")}`,
	];

	if (command.positionals.length > 0) {
		lines.push(
			"",
			"Arguments:",
			...table(
				command.positionals.map((positional) => [
					positional.name,
					positional.description +
						markers([
							positional.optional && "optional",
							positional.variadic && "repeatable",
						]),
				]),
			),
		);
	}

	const rows = Object.entries(options).map(([name, spec]) => [
		optionUsage(name, spec),
		spec.description + optionMarkers(spec),
	]);
	rows.push(["-h, --help", "Show this help"]);
	lines.push("", "Options:", ...table(rows));

	if (Object.values(options).some((spec) => spec.type === "string")) {
		lines.push(
			"",
			"A value that starts with '-' must be attached with '=', as in --option=-5.",
		);
	}

	return `${lines.join("\n")}\n`;
}

function renderCommandList(
	commands: readonly CommandInfo[],
	group: readonly string[],
): string[] {
	const listed = commands
		.filter((command) => startsWith(command.name, group))
		.map((command) => [command.name.join(" "), command.summary] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	if (listed.length === 0) return ["  (none)"];
	return table(listed.map(([name, summary]) => [name, summary]));
}

function positionalUsage(positional: PositionalSpec): string {
	const repeat = positional.variadic ? "..." : "";
	return positional.optional
		? `[${positional.name}${repeat}]`
		: `<${positional.name}>${repeat}`;
}

function optionUsage(name: string, spec: OptionSpec): string {
	const short = spec.short ? `-${spec.short}, ` : "    ";
	const value = spec.type === "string" ? ` <${spec.valueName ?? "value"}>` : "";
	return `${short}--${name}${value}`;
}

function optionMarkers(spec: OptionSpec): string {
	return markers([
		spec.required && "required",
		spec.multiple && "repeatable",
		spec.default !== undefined && `default: ${formatDefault(spec.default)}`,
	]);
}

function formatDefault(value: NonNullable<OptionSpec["default"]>): string {
	return Array.isArray(value) ? value.join(", ") : String(value);
}

function markers(items: (string | false | undefined)[]): string {
	const present = items.filter((item): item is string => Boolean(item));
	return present.length > 0 ? ` (${present.join(", ")})` : "";
}

function table(rows: string[][]): string[] {
	const width = Math.max(...rows.map(([left = ""]) => left.length));
	return rows.map(([left = "", right = ""]) =>
		`  ${left.padEnd(width)}  ${right}`.trimEnd(),
	);
}

export function startsWith(
	name: readonly string[],
	prefix: readonly string[],
): boolean {
	return prefix.every((word, i) => name[i] === word);
}
