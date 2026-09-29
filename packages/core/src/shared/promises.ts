/**
 * Waits for every promise, then returns the values in order, or throws the
 * first failure in order, so the error does not depend on timing.
 */
export async function settleInOrder<T>(
	promises: readonly Promise<T>[],
): Promise<T[]> {
	const results = await Promise.allSettled(promises);
	return results.map((result) => {
		if (result.status === "rejected") throw result.reason;
		return result.value;
	});
}
