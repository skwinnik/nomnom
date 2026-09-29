/** A problem located in a user file, such as a line that fails to parse. */
export interface Problem {
	file: string;
	line?: number;
	message: string;
}

/**
 * An error the user can fix. The CLI prints its message and problems without a
 * stack trace; any other exception is treated as unexpected.
 */
export class NomnomError extends Error {
	override readonly name = "NomnomError";
	readonly problems: readonly Problem[];

	constructor(message: string, problems: readonly Problem[] = []) {
		super(message);
		this.problems = problems;
	}
}
