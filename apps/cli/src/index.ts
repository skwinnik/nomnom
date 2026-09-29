#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import {
	createBunFileSystem,
	createServices,
	createSystemClock,
} from "@nomnom/core";
import { commands } from "./commands";
import { runCli } from "./runner";

// The composition root, and the only CLI file that touches the process.
const services = createServices({
	fs: createBunFileSystem(),
	clock: createSystemClock(),
	dataDir:
		process.env.NOMNOM_DIR || join(process.env.HOME || homedir(), ".nomnom"),
});

process.exitCode = await runCli({
	argv: Bun.argv.slice(2),
	commands,
	services,
	io: {
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
	},
	resolveContext: async () => ({ config: await services.config.load() }),
});
