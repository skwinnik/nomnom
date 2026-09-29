import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { formatItems } from "./format";

export const search = defineCommand({
	name: ["search"],
	summary: "Find foods and recipes by name, tolerating typos",
	positionals: [
		{
			name: "text",
			description:
				"Words to look for in names, in any order; the start of a word is enough",
			variadic: true,
		},
	],
	run: async (
		{ positionals },
		{ services, io }: CommandEnv<Pick<Services, "search">>,
	) => {
		const query = positionals.join(" ");
		const results = await services.search.search(query);
		io.stdout(
			results.length === 0
				? `No foods or recipes match '${query}'\n`
				: formatItems(results),
		);
	},
});
