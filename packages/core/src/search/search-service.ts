import {
	type Catalog,
	type ItemSummary,
	isArchived,
	summarise,
} from "../catalog/catalog";
import { NomnomError } from "../errors";
import { compareSlugs, slugWords } from "../shared/slug";
import { matchCost } from "./match";

export interface SearchService {
	/**
	 * Every non-archived food and recipe whose latest name matches the query,
	 * fewest edits first, then by slug. Fails when any file is invalid.
	 */
	search(text: string): Promise<ItemSummary[]>;
}

export function createSearchService(deps: { catalog: Catalog }): SearchService {
	const { catalog } = deps;

	return {
		async search(text) {
			const words = slugWords(text);
			if (words.length === 0) {
				throw new NomnomError(
					`The search '${text}' has no letters or digits to search for`,
				);
			}
			const matches: { item: ItemSummary; cost: number }[] = [];
			for (const found of await catalog.all()) {
				if (isArchived(found)) continue;
				const item = summarise(found);
				const cost = matchCost(words, item.name);
				if (cost !== undefined) matches.push({ item, cost });
			}
			return matches
				.sort(
					(a, b) => a.cost - b.cost || compareSlugs(a.item.slug, b.item.slug),
				)
				.map(({ item }) => item);
		},
	};
}
