import { NomnomError, type Services } from "@nomnom/core";
import { type CommandEnv, defineCommand } from "../runner";
import { printWarnings } from "./warnings";

export const check = defineCommand({
	name: ["check"],
	summary: "Check every file in the data directory for problems",
	run: async (_args, { services, io }: CommandEnv<Pick<Services, "check">>) => {
		const { errors, warnings, checked } = await services.check.check();
		printWarnings(io, warnings);
		if (errors.length > 0) {
			const files = new Set(errors.map(({ file }) => file)).size;
			throw new NomnomError(
				`${count(errors.length, "error")} in ${count(files, "file")}`,
				errors,
			);
		}
		io.stdout(
			`No errors in ${count(checked.foods, "food")}, ${count(checked.recipes, "recipe")} and ${count(checked.days, "day file")}\n`,
		);
	},
});

/** `1 food`, `2 foods`, `0 foods`. */
function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
