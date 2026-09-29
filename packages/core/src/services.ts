import type { Clock } from "./clock/clock";
import type { FileSystem } from "./fs/file-system";

/** The ports that services depend on. The CLI supplies real adapters; tests supply mocks. */
export interface ServiceDependencies {
	fs: FileSystem;
	clock: Clock;
}

/** Every core service. Members arrive with the features that need them. */
// biome-ignore lint/complexity/noBannedTypes: services are added by later changes
export type Services = {};

/**
 * Wires all services together. It is the only place that knows how services
 * depend on each other, and it does no I/O.
 */
export function createServices(_deps: ServiceDependencies): Services {
	return {};
}
