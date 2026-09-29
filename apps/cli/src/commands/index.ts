import type { Services } from "@nomnom/core";
import type { Command } from "../runner";
import { check } from "./check";
import { foodAdd } from "./food-add";
import { foodArchive } from "./food-archive";
import { foodList } from "./food-list";
import { foodShow } from "./food-show";
import { foodUnarchive } from "./food-unarchive";
import { foodUpdate } from "./food-update";
import { log } from "./log";
import { recipeAdd } from "./recipe-add";
import { recipeArchive } from "./recipe-archive";
import { recipeList } from "./recipe-list";
import { recipeShow } from "./recipe-show";
import { recipeUnarchive } from "./recipe-unarchive";
import { recipeUpdate } from "./recipe-update";
import { report } from "./report";
import { search } from "./search";

/** Every command the CLI offers. */
export const commands: readonly Command<Services>[] = [
	check,
	foodAdd,
	foodArchive,
	foodList,
	foodShow,
	foodUnarchive,
	foodUpdate,
	log,
	recipeAdd,
	recipeArchive,
	recipeList,
	recipeShow,
	recipeUnarchive,
	recipeUpdate,
	report,
	search,
];
