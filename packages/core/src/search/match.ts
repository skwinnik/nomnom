import { slugWords } from "../shared/slug";

/**
 * How many edits a query word may need to match: 0 for 1 to 3 characters, 1
 * for 4 to 7, and 2 for 8 or more.
 */
export function editBudget(length: number): number {
	if (length <= 3) return 0;
	if (length <= 7) return 1;
	return 2;
}

/**
 * The fewest edits that turn `query` into `word` or into any prefix of it,
 * where an edit inserts, deletes or replaces one character, or swaps two
 * adjacent ones (optimal string alignment). Counts code points.
 */
export function wordCost(query: string, word: string): number {
	const q = [...query];
	const w = [...word];
	// d[i][j]: edits between the first i characters of q and the first j of w.
	const d: number[][] = [];
	for (let i = 0; i <= q.length; i++) {
		const row = [i];
		for (let j = 1; j <= w.length; j++) {
			if (i === 0) {
				row.push(j);
				continue;
			}
			const above = d[i - 1] ?? [];
			const replace = (above[j - 1] ?? 0) + (q[i - 1] === w[j - 1] ? 0 : 1);
			let cost = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, replace);
			if (i > 1 && j > 1 && q[i - 1] === w[j - 2] && q[i - 2] === w[j - 1]) {
				cost = Math.min(cost, (d[i - 2]?.[j - 2] ?? 0) + 1);
			}
			row.push(cost);
		}
		d.push(row);
	}
	// The rest of the word is free, so the best prefix is the cheapest cell of the last row.
	return Math.min(...(d[q.length] ?? [q.length]));
}

/**
 * How many edits a name needs to match the query words: for each query word,
 * the cheapest name word within its edit budget, summed. `undefined` when a
 * query word matches no name word.
 */
export function matchCost(
	queryWords: readonly string[],
	name: string,
): number | undefined {
	const nameWords = slugWords(name);
	let total = 0;
	for (const query of queryWords) {
		const budget = editBudget([...query].length);
		let best: number | undefined;
		for (const word of nameWords) {
			const cost = wordCost(query, word);
			if (cost <= budget && (best === undefined || cost < best)) best = cost;
		}
		if (best === undefined) return undefined;
		total += best;
	}
	return total;
}
