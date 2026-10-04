const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** The local date of `date` as `yyyy-mm-dd`. */
export function localDate(date: Date): string {
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A local ISO 8601 timestamp with its UTC offset, as in `2026-09-29T20:10:00+03:00`. */
export function localTimestamp(date: Date): string {
	const offset = -date.getTimezoneOffset();
	const sign = offset < 0 ? "-" : "+";
	const abs = Math.abs(offset);
	const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	return `${localDate(date)}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Whether `text` is a real calendar date written as `yyyy-mm-dd`. */
export function isIsoDate(text: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number) as [
		number,
		number,
		number,
	];
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/**
 * Whether `text` is a time of day written as `HH:MM`, from `00:00` to `23:59`.
 * This is the only definition of a valid time: entry times in day files and
 * `--time` both use it.
 */
export function isTimeOfDay(text: string): boolean {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

/** Whether `text` is an ISO 8601 timestamp with a UTC offset or `Z`. */
export function isTimestampWithOffset(text: string): boolean {
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
		text,
	);
}

/**
 * Every `yyyy-mm-dd` date from `from` to `to`, both included, by calendar
 * arithmetic in UTC so that the time zone and the current time play no part.
 * Both must be real dates; empty when `to` is before `from`.
 */
export function datesBetween(from: string, to: string): string[] {
	const dates: string[] = [];
	const day = new Date(`${from}T00:00:00Z`);
	for (let date = from; date <= to; date = day.toISOString().slice(0, 10)) {
		dates.push(date);
		day.setUTCDate(day.getUTCDate() + 1);
	}
	return dates;
}
