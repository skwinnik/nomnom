import { inspect } from "node:util";
import {
	NomnomError,
	type StagedFileSystem,
	type StagedWrite,
} from "@nomnom/core";
import {
	type Command,
	type CommandContext,
	type CommandInfo,
	DRY_RUN,
	DRY_RUN_OPTION,
	type Io,
} from "./command";
import {
	PROGRAM,
	renderCommandHelp,
	renderGlobalUsage,
	renderGroupList,
	startsWith,
} from "./help";
import { parseCommandArgs } from "./parse";
import { formatPreview } from "./preview";

export interface RunCliInput<S> {
	/** The arguments after the program name. */
	argv: readonly string[];
	commands: readonly Command<S>[];
	services: S;
	io: Io;
	/** Called at most once, and only when the selected command's options depend on the context. */
	resolveContext: () => CommandContext | Promise<CommandContext>;
	/**
	 * The writes the services made while the command ran. They are committed
	 * after the command succeeds, previewed on `--dry-run`, and otherwise dropped.
	 */
	writes: Pick<StagedFileSystem, "staged" | "commit">;
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
		const declared =
			typeof command.options === "function"
				? command.options(await input.resolveContext())
				: command.options;
		const options = command.writes
			? { ...declared, [DRY_RUN]: DRY_RUN_OPTION }
			: declared;

		if (hasHelpFlag(rest)) {
			io.stdout(renderCommandHelp(command, options));
			return 0;
		}

		const parsed = parseCommandArgs(rest, options, command.positionals);
		if (!parsed.ok) return usageError(io, parsed.error, command.name);
		const { [DRY_RUN]: dryRunValue, ...values } = parsed.values;
		const dryRun = dryRunValue === true;

		// Held until the files are written, so it never reports a file that wasn't.
		let out = "";
		await command.run(
			{ values, positionals: parsed.positionals },
			{
				services: input.services,
				io: {
					stdout: (text) => {
						out += text;
					},
					stderr: io.stderr,
				},
				dryRun,
			},
		);

		if (dryRun) {
			io.stdout(formatDryRun(out, input.writes.staged()));
			return 0;
		}
		await input.writes.commit();
		io.stdout(out);
		return 0;
	} catch (error) {
		reportError(io, error);
		return 1;
	}
}

/** The command's output, the preview of each file, and a closing line, separated by blank lines. */
function formatDryRun(out: string, writes: readonly StagedWrite[]): string {
	return [
		out,
		...writes.map(formatPreview),
		"Dry run: no files were changed.\n",
	]
		.filter((section) => section !== "")
		.join("\n");
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
		const problems = error.problems.map((problem) =>
			problem.file === ""
				? `${problem.message}\n`
				: `${problem.file}${problem.line === undefined ? "" : `:${problem.line}`}: ${problem.message}\n`,
		);
		io.stderr(`error: ${error.message}\n${problems.join("")}`);
		return;
	}
	const detail =
		error instanceof Error && error.stack ? error.stack : inspect(error);
	io.stderr(`unexpected error: ${detail}\n`);
}
