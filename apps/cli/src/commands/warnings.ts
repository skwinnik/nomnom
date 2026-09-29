import type { Problem } from "@nomnom/core";
import type { Io } from "../runner";

/** Prints each warning to stderr as `warning: <file>:<line>: <message>`. */
export function printWarnings(io: Io, warnings: readonly Problem[]): void {
	for (const warning of warnings) {
		const at = warning.line === undefined ? "" : `:${warning.line}`;
		io.stderr(`warning: ${warning.file}${at}: ${warning.message}\n`);
	}
}
