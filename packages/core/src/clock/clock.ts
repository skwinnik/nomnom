/** The source of the current time. Core code asks it instead of calling `new Date()`. */
export interface Clock {
	now(): Date;
}
