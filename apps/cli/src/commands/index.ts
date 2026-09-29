import type { Services } from "@nomnom/core";
import type { Command } from "../runner";
import { foodAdd } from "./food-add";
import { log } from "./log";
import { recipeAdd } from "./recipe-add";

/** Every command the CLI offers. */
export const commands: readonly Command<Services>[] = [foodAdd, log, recipeAdd];
