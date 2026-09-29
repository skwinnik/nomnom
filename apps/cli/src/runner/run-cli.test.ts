import { describe, expect, test } from "bun:test";
import { NomnomError, type StagedWrite } from "@nomnom/core";
import { createCapturedIo } from "../__mocks__/io";
import { createWritesMock } from "../__mocks__/writes";
import {
	type Command,
	type CommandContext,
	type CommandEnv,
	defineCommand,
	runCli,
} from ".";

const context: CommandContext = {
	config: {
		nutrients: [
			{ id: "kcal", name: "Energy", unit: "kcal", required: true },
			{ id: "protein", name: "Protein", unit: "g", required: false },
		],
		meals: ["breakfast"],
	},
};

interface Call {
	command: string;
	values: Record<string, unknown>;
	positionals: string[];
}

function setup() {
	const calls: Call[] = [];
	const record =
		(command: string) =>
		({ values, positionals }: { values: object; positionals: string[] }) => {
			calls.push({ command, values: { ...values }, positionals });
		};

	const commands: Command<unknown>[] = [
		defineCommand({
			name: ["food", "list"],
			summary: "List foods",
			run: record("food list"),
		}),
		defineCommand({
			name: ["food", "add"],
			summary: "Add a food",
			options: {
				name: {
					type: "string",
					short: "n",
					required: true,
					description: "Display name",
				},
				barcode: {
					type: "string",
					multiple: true,
					valueName: "digits",
					description: "Barcode",
				},
				unit: { type: "string", default: "g", description: "Unit" },
				verbose: { type: "boolean", short: "v", description: "Say more" },
			},
			run: record("food add"),
		}),
		defineCommand({
			name: ["log"],
			summary: "Show a day",
			positionals: [{ name: "day", description: "Day to show" }],
			run: record("log"),
		}),
		defineCommand({
			name: ["tag"],
			summary: "Tag things",
			positionals: [
				{ name: "tag", description: "Tag name" },
				{
					name: "item",
					description: "Items to tag",
					optional: true,
					variadic: true,
				},
			],
			run: record("tag"),
		}),
		defineCommand({
			name: ["goal"],
			summary: "Set goals",
			options: (ctx) =>
				Object.fromEntries(
					ctx.config.nutrients.map(({ id }) => [
						id,
						{ type: "string" as const, description: `Goal for ${id}` },
					]),
				),
			run: record("goal"),
		}),
		defineCommand({
			name: ["say"],
			summary: "Print a greeting",
			run: (_args, { io }) => io.stdout("hello\n"),
		}),
		defineCommand({
			name: ["check"],
			summary: "Check day files",
			run: () => {
				throw new NomnomError("Day file has errors", [
					{
						file: "logs/2026/2026-09-28.nom",
						line: 4,
						message: "unknown food",
					},
					{ file: "foods/apple.toml", message: "missing name" },
					{
						file: "",
						message:
							"entry 2 'unicorn 1': 'unicorn' is neither a food nor a recipe",
					},
				]);
			},
		}),
		defineCommand({
			name: ["crash"],
			summary: "Fail unexpectedly",
			run: () => {
				throw new Error("kaboom");
			},
		}),
	];

	let contextCalls = 0;
	const run = async (...argv: string[]) => {
		const io = createCapturedIo();
		const code = await runCli({
			argv,
			commands,
			services: {},
			io,
			writes: createWritesMock(),
			resolveContext: () => {
				contextCalls++;
				return context;
			},
		});
		return { code, out: io.out, err: io.err };
	};

	return { run, calls, contextCalls: () => contextCalls };
}

describe("global usage", () => {
	test("no arguments print the usage to stdout and exit 0", async () => {
		const { run } = setup();

		const result = await run();

		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(result.out).toBe(
			[
				"Usage: nomnom <command> [options]",
				"",
				"Commands:",
				"  check      Check day files",
				"  crash      Fail unexpectedly",
				"  food add   Add a food",
				"  food list  List foods",
				"  goal       Set goals",
				"  log        Show a day",
				"  say        Print a greeting",
				"  tag        Tag things",
				"",
				"Run 'nomnom <command> --help' for help on a command.",
				"",
			].join("\n"),
		);
	});

	test("--help and -h print the same usage and exit 0", async () => {
		const { run } = setup();
		const usage = (await run()).out;

		for (const flag of ["--help", "-h"]) {
			const result = await run(flag);
			expect(result).toEqual({ code: 0, out: usage, err: "" });
		}
	});

	test("global usage does not resolve the context", async () => {
		const { run, contextCalls } = setup();

		await run("--help");

		expect(contextCalls()).toBe(0);
	});

	test("an unknown global option is a usage error", async () => {
		const { run } = setup();

		const result = await run("--version");

		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown option '--version'");
		expect(result.err).toContain("Run 'nomnom --help'");
	});
});

describe("command groups", () => {
	test("group help lists the subcommands on stdout and exits 0", async () => {
		const { run } = setup();

		const result = await run("food", "--help");

		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(result.out).toContain("food add   Add a food");
		expect(result.out).toContain("food list  List foods");
		expect(result.out).not.toContain("log");
	});

	test("a group without a subcommand is an error on stderr with the list", async () => {
		const { run, calls } = setup();

		const result = await run("food");

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toContain("'food' requires a subcommand");
		expect(result.err).toContain("food add   Add a food");
		expect(result.err).toContain("food list  List foods");
		expect(calls).toEqual([]);
	});

	test("an unknown subcommand is named in the error", async () => {
		const { run } = setup();

		const result = await run("food", "eat");

		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown command 'food eat'");
		expect(result.err).toContain("food add");
	});
});

describe("unknown command", () => {
	test("names the command and hints at the global help", async () => {
		const { run } = setup();

		const result = await run("frobnicate");

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toContain("unknown command 'frobnicate'");
		expect(result.err).toContain("Run 'nomnom --help'");
	});
});

describe("command help", () => {
	test("prints summary, usage line and options without running the command", async () => {
		const { run, calls } = setup();

		const result = await run("food", "add", "--help");

		expect(result.code).toBe(0);
		expect(result.err).toBe("");
		expect(calls).toEqual([]);
		expect(result.out).toBe(
			[
				"Add a food",
				"",
				"Usage: nomnom food add [options]",
				"",
				"Options:",
				"  -n, --name <value>      Display name (required)",
				"      --barcode <digits>  Barcode (repeatable)",
				"      --unit <value>      Unit (default: g)",
				"  -v, --verbose           Say more",
				"  -h, --help              Show this help",
				"",
				"A value that starts with '-' must be attached with '=', as in --option=-5.",
				"",
			].join("\n"),
		);
	});

	test("marks optional and repeatable positionals", async () => {
		const { run } = setup();

		const tag = await run("tag", "-h");
		const log = await run("log", "-h");

		expect(tag.out).toContain("Usage: nomnom tag <tag> [item...] [options]");
		expect(tag.out).toContain("  item  Items to tag (optional, repeatable)");
		expect(log.out).toContain("Usage: nomnom log <day> [options]");
		expect(log.out).toContain("  day  Day to show");
		expect(log.out).not.toContain("attached with '='");
	});

	test("takes precedence over an unknown option", async () => {
		const { run } = setup();

		const result = await run("food", "add", "--unknown-option", "--help");

		expect(result.code).toBe(0);
		expect(result.out).toContain("Add a food");
		expect(result.err).toBe("");
	});

	test("takes precedence over a missing required option", async () => {
		const { run } = setup();

		const result = await run("food", "add", "-h");

		expect(result.code).toBe(0);
		expect(result.out).toContain("--name <value>");
	});

	test("is ignored after the -- terminator", async () => {
		const { run, calls } = setup();

		const result = await run("log", "--", "--help");

		expect(result.code).toBe(0);
		expect(calls).toEqual([
			{ command: "log", values: {}, positionals: ["--help"] },
		]);
	});
});

describe("one definition drives parsing and help", () => {
	test("a declared option is documented and accepted", async () => {
		const { run, calls } = setup();

		const help = await run("food", "add", "--help");
		const result = await run("food", "add", "--name", "Apple");

		expect(help.out).toContain("--name <value>      Display name");
		expect(result.code).toBe(0);
		expect(calls).toEqual([
			{
				command: "food add",
				values: { name: "Apple", unit: "g" },
				positionals: [],
			},
		]);
	});

	test("an undeclared option is neither documented nor accepted", async () => {
		const { run, calls } = setup();

		const help = await run("food", "add", "--help");
		const result = await run(
			"food",
			"add",
			"--name",
			"Apple",
			"--colour",
			"red",
		);

		expect(help.out).not.toContain("--colour");
		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown option '--colour'");
		expect(calls).toEqual([]);
	});

	test("runtime-dependent options appear in help and are accepted", async () => {
		const { run, calls, contextCalls } = setup();

		const help = await run("goal", "--help");
		expect(contextCalls()).toBe(1);
		const result = await run("goal", "--kcal", "2000", "--protein", "120");
		expect(contextCalls()).toBe(2);

		expect(help.out).toContain("--kcal <value>");
		expect(help.out).toContain("Goal for kcal");
		expect(help.out).toContain("--protein <value>");
		expect(result.code).toBe(0);
		expect(calls).toEqual([
			{
				command: "goal",
				values: { kcal: "2000", protein: "120" },
				positionals: [],
			},
		]);
	});

	test("static options do not resolve the context", async () => {
		const { run, contextCalls } = setup();

		await run("food", "add", "--help");
		await run("food", "add", "--name", "Apple");

		expect(contextCalls()).toBe(0);
	});

	test("repeatable options collect every value", async () => {
		const { run, calls } = setup();

		await run(
			"food",
			"add",
			"-n",
			"Apple",
			"--barcode",
			"1",
			"--barcode",
			"2",
			"-v",
		);

		expect(calls[0]?.values).toEqual({
			name: "Apple",
			barcode: ["1", "2"],
			unit: "g",
			verbose: true,
		});
	});

	test("a value starting with '-' can be attached with '='", async () => {
		const { run, calls } = setup();

		await run("goal", "--kcal=-5");

		expect(calls[0]?.values).toEqual({ kcal: "-5" });
	});
});

describe("usage errors", () => {
	const hint = "Run 'nomnom food add --help' for usage.";

	test.each([
		[["--colour", "red"], "unknown option '--colour'"],
		[["-x"], "unknown option '-x'"],
		[["--name"], "option '--name' requires a value"],
		[["-n"], "option '--name' requires a value"],
		[
			["--name", "A", "--verbose=yes"],
			"option '--verbose' does not take a value",
		],
		[[], "missing required option '--name'"],
		[
			["--name", "A", "--name", "B"],
			"option '--name' was given more than once",
		],
		[["-n", "A", "--name", "B"], "option '--name' was given more than once"],
		[
			["--name", "A", "extra"],
			"unexpected argument 'extra': this command takes no arguments",
		],
	])("food add %j fails with %s", async (args, message) => {
		const { run, calls } = setup();

		const result = await run("food", "add", ...args);

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toBe(`error: ${message}\n${hint}\n`);
		expect(calls).toEqual([]);
	});

	test.each([
		[[], "missing argument <day>"],
		[
			["2026-09-28", "2026-09-29"],
			"too many arguments: expected at most 1, got 2",
		],
	])("log %j fails with %s", async (args, message) => {
		const { run, calls } = setup();

		const result = await run("log", ...args);

		expect(result.code).toBe(1);
		expect(result.err).toBe(
			`error: ${message}\nRun 'nomnom log --help' for usage.\n`,
		);
		expect(calls).toEqual([]);
	});

	test("a variadic positional accepts any number of values", async () => {
		const { run, calls } = setup();

		const none = await run("tag");
		const many = await run("tag", "fruit", "apple", "pear", "plum");

		expect(none.err).toContain("missing argument <tag>");
		expect(many.code).toBe(0);
		expect(calls[0]?.positionals).toEqual(["fruit", "apple", "pear", "plum"]);
	});
});

describe("error reporting and exit codes", () => {
	test("a user-fixable error prints its message and problems without a stack trace", async () => {
		const { run } = setup();

		const result = await run("check");

		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toBe(
			[
				"error: Day file has errors",
				"logs/2026/2026-09-28.nom:4: unknown food",
				"foods/apple.toml: missing name",
				"entry 2 'unicorn 1': 'unicorn' is neither a food nor a recipe",
				"",
			].join("\n"),
		);
	});

	test("an unexpected failure prints the error with its stack trace", async () => {
		const { run } = setup();

		const result = await run("crash");

		expect(result.code).toBe(1);
		expect(result.err).toContain("Error: kaboom");
		expect(result.err).toMatch(/\n\s+at /);
	});

	test("a successful command writes to stdout and exits 0", async () => {
		const { run } = setup();

		const result = await run("say");

		expect(result).toEqual({ code: 0, out: "hello\n", err: "" });
	});

	test("an error while resolving the context is reported", async () => {
		const io = createCapturedIo();
		const command = defineCommand({
			name: ["goal"],
			summary: "Set goals",
			options: () => ({}),
			run: () => {},
		});

		const code = await runCli({
			argv: ["goal"],
			commands: [command],
			services: {},
			io,
			writes: createWritesMock(),
			resolveContext: () => {
				throw new NomnomError("Config is invalid", [
					{ file: "config.toml", line: 2, message: "unknown key" },
				]);
			},
		});

		expect(code).toBe(1);
		expect(io.err).toBe(
			"error: Config is invalid\nconfig.toml:2: unknown key\n",
		);
	});
});

describe("services per command", () => {
	interface Greeter {
		greet(name: string): string;
	}
	interface TestServices {
		greeter: Greeter;
		other: { unused(): void };
	}

	test("a command receives the services it declares", async () => {
		const greet = defineCommand({
			name: ["greet"],
			summary: "Greet someone",
			positionals: [{ name: "name", description: "Who to greet" }],
			run: (
				{ positionals: [name = ""] },
				env: CommandEnv<Pick<TestServices, "greeter">>,
			) => {
				env.io.stdout(`${env.services.greeter.greet(name)}\n`);
			},
		});
		// Only what the command uses is mocked, typed as the interface it replaces.
		const greeter: Greeter = { greet: (name) => `Hi, ${name}!` };
		const io = createCapturedIo();

		const code = await runCli({
			argv: ["greet", "Ada"],
			commands: [greet],
			services: { greeter },
			io,
			writes: createWritesMock(),
			resolveContext: () => context,
		});

		expect(code).toBe(0);
		expect(io.out).toBe("Hi, Ada!\n");
	});
});

describe("writes", () => {
	const staged: StagedWrite[] = [
		{ path: "/data/a.txt", before: undefined, after: "apple\n" },
		{ path: "/data/b.txt", before: "one\n", after: "one\ntwo\n" },
	];

	function setupWrites(outcome: Parameters<typeof createWritesMock>[0] = {}) {
		const envs: { values: object; dryRun: boolean }[] = [];
		const commands: Command<unknown>[] = [
			defineCommand({
				name: ["add"],
				summary: "Add something",
				writes: true,
				options: { name: { type: "string", description: "Name" } },
				run: ({ values }, { io, dryRun }) => {
					envs.push({ values: { ...values }, dryRun });
					io.stderr("warning: careful\n");
					io.stdout(dryRun ? "Would create a\n" : "Created a\n");
				},
			}),
			defineCommand({
				name: ["goal"],
				summary: "Set goals",
				writes: true,
				options: () => ({ kcal: { type: "string", description: "kcal" } }),
				run: () => {},
			}),
			defineCommand({
				name: ["list"],
				summary: "List things",
				run: (_args, { io, dryRun }) => {
					envs.push({ values: {}, dryRun });
					io.stdout("a\n");
				},
			}),
			defineCommand({
				name: ["fail"],
				summary: "Fail after output",
				writes: true,
				run: (_args, { io }) => {
					io.stdout("Created a\n");
					io.stderr("warning: careful\n");
					throw new NomnomError("It failed");
				},
			}),
		];
		const writes = createWritesMock({ staged, ...outcome });
		const run = async (...argv: string[]) => {
			const io = createCapturedIo();
			const code = await runCli({
				argv,
				commands,
				services: {},
				io,
				writes,
				resolveContext: () => context,
			});
			return { code, out: io.out, err: io.err };
		};
		return { run, envs, writes };
	}

	test("the help of a writing command lists --dry-run, and other help doesn't", async () => {
		const { run } = setupWrites();

		const add = await run("add", "--help");
		const goal = await run("goal", "--help");
		const list = await run("list", "--help");

		for (const help of [add.out, goal.out]) {
			expect(help).toMatch(
				/ {4}--dry-run +Check everything and show what would be written, without changing any file\n/,
			);
		}
		expect(list.out).not.toContain("--dry-run");
	});

	test("--dry-run on a command that doesn't write is a usage error", async () => {
		const { run, writes } = setupWrites();

		const result = await run("list", "--dry-run");

		expect(result.code).toBe(1);
		expect(result.err).toContain("unknown option '--dry-run'");
		expect(writes.commits).toBe(0);
	});

	test("run receives dryRun and no dry-run value", async () => {
		const { run, envs } = setupWrites();

		await run("add", "--name", "a", "--dry-run");
		await run("add", "--name", "a");
		await run("list");

		expect(envs).toEqual([
			{ values: { name: "a" }, dryRun: true },
			{ values: { name: "a" }, dryRun: false },
			{ values: {}, dryRun: false },
		]);
	});

	test("a successful command commits once, then prints its output", async () => {
		const { run, writes } = setupWrites();

		const result = await run("add");

		expect(result).toEqual({
			code: 0,
			out: "Created a\n",
			err: "warning: careful\n",
		});
		expect(writes.commits).toBe(1);
	});

	test("a successful command that doesn't write commits too", async () => {
		const { run, writes } = setupWrites();

		expect((await run("list")).code).toBe(0);
		expect(writes.commits).toBe(1);
	});

	test("a dry run prints the output, the previews and a closing line without committing", async () => {
		const { run, writes } = setupWrites();

		const result = await run("add", "--dry-run");

		expect(result.code).toBe(0);
		expect(result.out).toBe(
			[
				"Would create a",
				"",
				"/data/a.txt (new file)",
				"+ apple",
				"",
				"/data/b.txt",
				"  one",
				"+ two",
				"",
				"Dry run: no files were changed.",
				"",
			].join("\n"),
		);
		expect(writes.commits).toBe(0);
	});

	test("an error, a usage error and --help don't commit", async () => {
		const { run, writes } = setupWrites();

		await run("fail");
		await run("add", "--unknown");
		await run("add", "--help");

		expect(writes.commits).toBe(0);
	});

	test("a failing command drops its output but keeps its stderr", async () => {
		const { run } = setupWrites();

		const result = await run("fail");

		expect(result).toEqual({
			code: 1,
			out: "",
			err: "warning: careful\nerror: It failed\n",
		});
	});

	test("a failing commit exits 1 with its error and prints no output", async () => {
		const { run } = setupWrites({
			error: new NomnomError(
				"Wrote /data/a.txt, but could not write /data/b.txt",
				[{ file: "/data/b.txt", message: "disk full" }],
			),
		});

		const result = await run("add");

		expect(result).toEqual({
			code: 1,
			out: "",
			err: "warning: careful\nerror: Wrote /data/a.txt, but could not write /data/b.txt\n/data/b.txt: disk full\n",
		});
	});
});
