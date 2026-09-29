import { inspect } from "node:util";
import { NomnomError } from "@nomnom/core";
import type { Command, CommandContext, CommandInfo, Io } from "./command";
import {
	PROGRAM,
	renderCommandHelp,
	renderGlobalUsage,
	renderGroupList,
	startsWith,
} from "./help";
import { parseCommandArgs } from "./parse";

export interface RunCliInput<S> {
	/** The arguments after the program name. */
	argv: readonly string[];
	commands: readonly Command<S>[];
	services: S;
	io: Io;
	/** Called at most once, and only when the selected command's options depend on the context. */
	resolveContext: () => CommandContext | Promise<CommandContext>;
}

/** Runs one command line and returns the exit code. Never exits the process. */
export async function runCli<S>(input: RunCliInput<S>): Promise<number> {
	const { argv, commands, io } = input;
	const { path, rest } = resolveCommandPath(argv, commands);
	const command = commands.find(
		(candidate) =>
			candidate.name.length === path.length && startsWith(candidate.name, path),
	);

	if (!command) {
		if (path.length === 0) return runWithoutCommand(argv, commands, io);
		return runGroup(path, rest, commands, io);
	}

	try {
		const options =
			typeof command.options === "function"
				? command.options(await input.resolveContext())
				: command.options;

		if (hasHelpFlag(rest)) {
			io.stdout(renderCommandHelp(command, options));
			return 0;
		}

		const parsed = parseCommandArgs(rest, options, command.positionals);
		if (!parsed.ok) return usageError(io, parsed.error, command.name);

		await command.run(
			{ values: parsed.values, positionals: parsed.positionals },
			{ services: input.services, io },
		);
		return 0;
	} catch (error) {
		reportError(io, error);
		return 1;
	}
}

/** Takes leading non-option tokens while they extend a known group or command name. */
function resolveCommandPath(
	argv: readonly string[],
	commands: readonly CommandInfo[],
): { path: string[]; rest: string[] } {
	const path: string[] = [];
	for (const token of argv) {
		if (token.startsWith("-")) break;
		const candidate = [...path, token];
		if (!commands.some((command) => startsWith(command.name, candidate))) break;
		path.push(token);
	}
	return { path, rest: argv.slice(path.length) };
}

function runWithoutCommand(
	argv: readonly string[],
	commands: readonly CommandInfo[],
	io: Io,
): number {
	const [first] = argv;
	if (first === undefined) {
		io.stdout(renderGlobalUsage(commands));
		return 0;
	}
	if (!first.startsWith("-")) {
		return usageError(io, `unknown command '${first}'`, []);
	}
	if (hasHelpFlag(argv)) {
		io.stdout(renderGlobalUsage(commands));
		return 0;
	}
	return usageError(
		io,
		first === "--" ? "missing command" : `unknown option '${first}'`,
		[],
	);
}

function runGroup(
	group: string[],
	rest: string[],
	commands: readonly CommandInfo[],
	io: Io,
): number {
	const list = renderGroupList(commands, group);
	if (hasHelpFlag(rest)) {
		io.stdout(list);
		return 0;
	}
	const [next] = rest;
	const message =
		next !== undefined && !next.startsWith("-")
			? `unknown command '${[...group, next].join(" ")}'`
			: `'${group.join(" ")}' requires a subcommand`;
	io.stderr(`error: ${message}\n\n${list}`);
	return 1;
}

/** Whether `-h` or `--help` appears before any `--` terminator. */
function hasHelpFlag(tokens: readonly string[]): boolean {
	for (const token of tokens) {
		if (token === "--") return false;
		if (token === "-h" || token === "--help") return true;
	}
	return false;
}

function usageError(io: Io, message: string, name: readonly string[]): number {
	const help = [PROGRAM, ...name, "--help"].join(" ");
	io.stderr(`error: ${message}\nRun '${help}' for usage.\n`);
	return 1;
}

function reportError(io: Io, error: unknown): void {
	if (error instanceof NomnomError) {
		const problems = error.problems.map(
			(problem) =>
				`${problem.file}${problem.line === undefined ? "" : `:${problem.line}`}: ${problem.message}\n`,
		);
		io.stderr(`error: ${error.message}\n${problems.join("")}`);
		return;
	}
	const detail =
		error instanceof Error && error.stack ? error.stack : inspect(error);
	io.stderr(`unexpected error: ${detail}\n`);
}
