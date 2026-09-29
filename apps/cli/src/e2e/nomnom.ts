import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const entry = join(import.meta.dir, "..", "index.ts");

export interface RunResult {
	code: number;
	out: string;
	err: string;
}

/** Environment overrides for one run. `undefined` removes a variable. */
export type EnvOverrides = Record<string, string | undefined>;

export interface Sandbox {
	/** A fresh temporary directory, used as `NOMNOM_DIR` unless overridden. */
	readonly dir: string;
	/** Runs `nomnom` with `NOMNOM_DIR` set to `dir`. */
	nomnom(...args: string[]): Promise<RunResult>;
	/** Runs `nomnom` with further environment overrides. */
	nomnomWithEnv(env: EnvOverrides, ...args: string[]): Promise<RunResult>;
}

/**
 * Runs `test` with a sandbox whose temporary directory is removed afterwards,
 * whether the test passes or fails.
 */
export async function withSandbox(
	test: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), "nomnom-e2e-"));
	const nomnomWithEnv = (env: EnvOverrides, ...args: string[]) =>
		spawnNomnom(args, { NOMNOM_DIR: dir, ...env });
	try {
		await test({
			dir,
			nomnom: (...args) => nomnomWithEnv({}, ...args),
			nomnomWithEnv,
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Every path under a directory, with the bytes of each file, or `missing`. */
export type Tree = Record<string, Uint8Array | "directory"> | "missing";

export async function snapshotTree(dir: string): Promise<Tree> {
	const found = await stat(dir).catch(() => undefined);
	if (!found) return "missing";
	const tree: Record<string, Uint8Array | "directory"> = {};
	for (const path of (await readdir(dir, { recursive: true })).sort()) {
		const full = join(dir, path);
		tree[path] = (await stat(full)).isDirectory()
			? "directory"
			: new Uint8Array(await readFile(full));
	}
	return tree;
}

async function spawnNomnom(
	args: string[],
	overrides: EnvOverrides,
): Promise<RunResult> {
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries({
		...process.env,
		...overrides,
	})) {
		if (value !== undefined) env[name] = value;
	}
	const proc = Bun.spawn(["bun", entry, ...args], {
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, out, err };
}
