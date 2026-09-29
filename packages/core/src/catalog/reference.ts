import type { Config } from "../config/config";
import { NomnomError } from "../errors";
import { usabilityProblems } from "../foods/usable";
import type { ItemRef } from "../shared/references";
import type { ItemKind } from "../store/records";
import { type Catalog, isArchived, pickVersion } from "./catalog";
import { type ItemVersion, measureOf, refName, unitFactor } from "./units";

/**
 * A reference failed because of its target, not the reference itself: the
 * target's file is invalid, its slug is both a food and a recipe, or the food
 * version it pins is unusable. Collectors that report the target on its own
 * can leave these out.
 */
export class TargetError extends NomnomError {}

export interface ReferenceOptions {
	/** The unit of the reference; default: the version's default unit. */
	unit?: string;
	/** The kind the reference expects, as a recipe ingredient does. */
	kind?: ItemKind;
	/**
	 * The reference is being newly written, so an archived item is rejected.
	 * Existing pinned references resolve regardless.
	 */
	newReference?: boolean;
}

export interface ResolvedReference {
	item: ItemVersion;
	/** The unit given, or the version's default unit. */
	unit: string;
}

/**
 * Resolves a reference to a food or recipe version and checks it by the
 * shared rules: the item exists, the version exists, it is of the expected
 * kind, a food version is usable, and the unit is allowed. The version is the
 * latest one when the reference has none. Throws `TargetError` when the
 * target is at fault and `NomnomError` when the reference is.
 */
export async function resolveReference(
	deps: { catalog: Catalog; config: Config },
	ref: ItemRef,
	options: ReferenceOptions = {},
): Promise<ResolvedReference> {
	const found = await deps.catalog.find(ref.slug).catch((error: unknown) => {
		if (error instanceof NomnomError && !(error instanceof TargetError)) {
			throw new TargetError(error.message, error.problems);
		}
		throw error;
	});
	if (!found) {
		throw new NomnomError(`'${ref.slug}' is neither a food nor a recipe`);
	}
	if (options.newReference && isArchived(found)) {
		throw new NomnomError(
			`'${ref.slug}' is archived and can't be newly referenced`,
		);
	}
	const item: ItemVersion =
		found.kind === "food"
			? {
					kind: "food",
					slug: found.slug,
					record: pickVersion(found, ref.version),
				}
			: {
					kind: "recipe",
					slug: found.slug,
					record: pickVersion(found, ref.version),
				};
	if (options.kind !== undefined && item.kind !== options.kind) {
		throw new NomnomError(
			`'${ref.slug}' is a ${item.kind}, not a ${options.kind}`,
		);
	}
	if (item.kind === "food") {
		const problems = usabilityProblems(item.record, deps.config.nutrients);
		if (problems.length > 0) {
			throw new TargetError(
				`'${refName(item)}' is unusable: ${problems.join("; ")}`,
			);
		}
	}
	const unit = options.unit ?? measureOf(item).defaultUnit;
	unitFactor(item, unit);
	return { item, unit };
}
