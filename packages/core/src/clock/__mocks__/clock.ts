import type { Clock } from "../clock";

export interface FixedClock extends Clock {
	set(date: Date): void;
}

/** A clock that always returns the time it was given, until `set` changes it. */
export function createFixedClock(date: Date): FixedClock {
	let current = new Date(date);
	return {
		now: () => new Date(current),
		set: (next) => {
			current = new Date(next);
		},
	};
}
