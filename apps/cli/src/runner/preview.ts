import type { StagedWrite } from "@nomnom/core";

/** Unchanged lines shown before and after the changed ones. */
const CONTEXT = 2;

/**
 * A file a dry run would write: its path, then every line of a new file
 * prefixed with `+ `, or the lines added to and removed from an existing file
 * with up to two unchanged lines around them.
 */
export function formatPreview(write: StagedWrite): string {
	const after = splitLines(write.after);
	if (write.before === undefined) {
		return render(`${write.path} (new file)`, [
			...after.map((line) => prefixed("+", line)),
		]);
	}

	const before = splitLines(write.before);
	let start = 0;
	while (
		start < before.length &&
		start < after.length &&
		before[start] === after[start]
	) {
		start++;
	}
	let end = 0;
	while (
		end < before.length - start &&
		end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	) {
		end++;
	}

	return render(write.path, [
		...before.slice(Math.max(0, start - CONTEXT), start).map(unchanged),
		...before.slice(start, before.length - end).map((l) => prefixed("-", l)),
		...after.slice(start, after.length - end).map((l) => prefixed("+", l)),
		...before
			.slice(before.length - end, before.length - end + CONTEXT)
			.map(unchanged),
	]);
}

/** The lines of a text, without the empty string after a final line break. */
function splitLines(text: string): string[] {
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function prefixed(marker: "+" | "-", line: string): string {
	return line === "" ? marker : `${marker} ${line}`;
}

function unchanged(line: string): string {
	return line === "" ? "" : `  ${line}`;
}

function render(header: string, lines: string[]): string {
	return [header, ...lines].map((line) => `${line}\n`).join("");
}
