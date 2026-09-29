import type { Services } from "@nomnom/core";
import type { Command } from "../runner";
import { foodAdd } from "./food-add";
import { foodList } from "./food-list";
import { foodShow } from "./food-show";
import { log } from "./log";
import { recipeAdd } from "./recipe-add";
import { recipeList } from "./recipe-list";
import { recipeShow } from "./recipe-show";
import { report } from "./report";
import { search } from "./search";

/** Every command the CLI offers. */
export const commands: readonly Command<Services>[] = [
	foodAdd,
	foodList,
	foodShow,
	log,
	recipeAdd,
	recipeList,
	recipeShow,
	report,
	search,
];
