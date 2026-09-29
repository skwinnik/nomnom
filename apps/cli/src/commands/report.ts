import type { Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { reportJson } from "./report-json";
import { formatReport } from "./report-text";
import { printWarnings } from "./warnings";

export const report = defineCommand({
	name: ["report"],
	summary: "Show what you ate on a day or over a date range",
	positionals: [
		{
			name: "from",
			description:
				"The day to report, or the first day of a range (default: today)",
			optional: true,
		},
		{
			name: "to",
			description: "The last day of the range, included",
			optional: true,
		},
	],
	options: {
		entries: {
			type: "boolean",
			description: "In a range report, include each day's entries",
		},
		json: {
			type: "boolean",
			description: "Print the report as JSON instead of text",
		},
	},
	run: async (
		{ values, positionals },
		{ services, io }: CommandEnv<Pick<Services, "report">>,
	) => {
		const [from, to] = positionals;
		const result = await services.report.report({
			...(from === undefined ? {} : { from }),
			...(to === undefined ? {} : { to }),
			entries: values.entries === true,
		});
		printWarnings(io, result.warnings);
		io.stdout(
			values.json
				? `${JSON.stringify(reportJson(result))}\n`
				: formatReport(result),
		);
	},
});
