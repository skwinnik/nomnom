import type { StagedWrite } from "@nomnom/core";
import type { RunCliInput } from "../runner";

type Writes = RunCliInput<unknown>["writes"];

export interface WritesMock extends Writes {
	/** How many times `commit` was called. */
	readonly commits: number;
}

/**
 * Staged writes that report `staged` and count commits, or throw `error` from
 * `commit`.
 */
export function createWritesMock(
	outcome: { staged?: StagedWrite[]; error?: Error } = {},
): WritesMock {
	let commits = 0;
	return {
		staged: () => outcome.staged ?? [],
		commit: async () => {
			commits++;
			if (outcome.error) throw outcome.error;
		},
		get commits() {
			return commits;
		},
	};
}
