import { compareSlugs } from "../shared/slug";
import type { RecipeVersion } from "../store/records";

/**
 * Every group of recipe versions that reference each other through
 * ingredients: the strongly connected components of the version graph with
 * more than one version, or with one version that pins itself. Each group
 * lists its versions as `<slug>@<version>` in code point order, and the groups
 * are in the order of their first version.
 *
 * The nodes are the given versions; the edges are recipe ingredients that pin
 * one of them. Tarjan's algorithm visits nodes and edges in `<slug>@<version>`
 * order, so the result does not depend on the order of the input.
 */
export function findCycles(
	recipes: ReadonlyMap<string, readonly RecipeVersion[]>,
): string[][] {
	const edges = new Map<string, string[]>();
	for (const [slug, versions] of recipes) {
		for (const version of versions) {
			edges.set(`${slug}@${version.version}`, []);
		}
	}
	for (const [slug, versions] of recipes) {
		for (const version of versions) {
			const targets = version.ingredients
				.filter((ingredient) => ingredient.kind === "recipe")
				.map(({ slug, version }) => `${slug}@${version}`)
				.filter((name) => edges.has(name));
			edges.set(
				`${slug}@${version.version}`,
				[...new Set(targets)].sort(compareSlugs),
			);
		}
	}

	const index = new Map<string, number>();
	const lowLink = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const groups: string[][] = [];
	const low = (node: string): number => lowLink.get(node) ?? 0;

	const connect = (node: string): void => {
		index.set(node, index.size);
		lowLink.set(node, index.get(node) ?? 0);
		stack.push(node);
		onStack.add(node);
		for (const next of edges.get(node) ?? []) {
			if (!index.has(next)) {
				connect(next);
				lowLink.set(node, Math.min(low(node), low(next)));
			} else if (onStack.has(next)) {
				lowLink.set(node, Math.min(low(node), index.get(next) ?? 0));
			}
		}
		if (low(node) !== index.get(node)) return;
		const group: string[] = [];
		let member: string | undefined;
		do {
			member = stack.pop();
			if (member === undefined) break;
			onStack.delete(member);
			group.push(member);
		} while (member !== node);
		if (group.length > 1 || edges.get(node)?.includes(node)) {
			groups.push(group.sort(compareSlugs));
		}
	};

	for (const node of [...edges.keys()].sort(compareSlugs)) {
		if (!index.has(node)) connect(node);
	}
	return groups.sort((a, b) => compareSlugs(a[0] ?? "", b[0] ?? ""));
}
