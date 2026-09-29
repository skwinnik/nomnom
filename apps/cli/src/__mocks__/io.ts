/*
 * Mocks for CLI tests.
 *
 * - A mock is typed as the interface it replaces (a core service interface
 *   imported from "@nomnom/core", or a CLI interface such as `Io`), so a change
 *   to that interface breaks the mock when `bun run typecheck` runs.
 * - Mock only what the command under test uses: a command declares the
 *   services it needs (`CommandEnv<Pick<Services, "foods">>`), and its test
 *   passes just those.
 * - Never import mocks from core. Core does not export them, and lint forbids
 *   reaching into another package's `__mocks__`. Write the CLI's own here.
 * - Only tests and other mocks may import from `__mocks__`.
 */
import type { Io } from "../runner";

export interface CapturedIo extends Io {
	/** Everything written to standard output so far. */
	readonly out: string;
	/** Everything written to standard error so far. */
	readonly err: string;
}

export function createCapturedIo(): CapturedIo {
	let out = "";
	let err = "";
	return {
		stdout: (text) => {
			out += text;
		},
		stderr: (text) => {
			err += text;
		},
		get out() {
			return out;
		},
		get err() {
			return err;
		},
	};
}
