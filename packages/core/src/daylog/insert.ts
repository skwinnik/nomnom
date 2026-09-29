import { type DayLine, isEntry } from "./parse";

/**
 * Inserts entry lines for `meal`, together and in order, into the lines of a
 * day file and returns the new text. Existing lines are kept exactly as they
 * were:
 * - into the meal's last section, right after its last entry or comment
 * - otherwise as a new section before the first section of a later meal
 *   (unknown meals come after all configured ones), or at the end, separated
 *   from its neighbours by blank lines
 * The text always ends with a line break.
 */
export function insertEntries(
	lines: readonly DayLine[],
	meal: string,
	entries: readonly string[],
	meals: readonly string[],
): string {
	const raws = lines.map((line) => line.raw);
	const sections = lines.flatMap((line, index) =>
		line.content.kind === "section" ? [{ meal: line.content.meal, index }] : [],
	);

	const own = sections.filter((section) => section.meal === meal).at(-1);
	if (own) {
		const next = sections.find((section) => section.index > own.index);
		const end = next ? next.index : lines.length;
		let at = own.index + 1;
		for (let i = own.index + 1; i < end; i++) {
			const { content } = lines[i] as DayLine;
			if (isEntry(content) || content.kind === "comment") at = i + 1;
		}
		raws.splice(at, 0, ...entries);
		return finish(raws);
	}

	const rank = (name: string) => {
		const index = meals.indexOf(name);
		return index < 0 ? Number.POSITIVE_INFINITY : index;
	};
	const block = [`[${meal}]`, ...entries];
	const later = sections.find((section) => rank(section.meal) > rank(meal));
	if (later) {
		const before = later.index > 0 && raws[later.index - 1]?.trim() !== "";
		raws.splice(later.index, 0, ...(before ? [""] : []), ...block, "");
		return finish(raws);
	}

	const last = raws.at(-1);
	if (last !== undefined && last.trim() !== "") raws.push("");
	raws.push(...block);
	return finish(raws);
}

function finish(raws: string[]): string {
	return `${raws.join("\n")}\n`;
}
