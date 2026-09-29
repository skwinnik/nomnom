#!/usr/bin/env bun
import { homedir } from "node:os";
import { join } from "node:path";
import {
	createBunFileSystem,
	createServices,
	createStagedFileSystem,
	createSystemClock,
} from "@nomnom/core";
import { commands } from "./commands";
import { runCli } from "./runner";

// The composition root, and the only CLI file that touches the process.
// Services write to the staged file system; runCli commits it on success.
const fs = createStagedFileSystem(createBunFileSystem());
const services = createServices({
	fs,
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
	writes: fs,
});
