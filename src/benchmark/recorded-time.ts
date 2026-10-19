import { z } from "zod";

import recordedInstant from "./recorded-instant";

/**
 * The start time an attempt or group records: an ISO instant every reader
 * can place, so a record never shows a time it is not ordered by.
 */
const startedAtSchema = z.iso
	.datetime()
	.refine((time) => recordedInstant(time) !== undefined, {
		message: "Expected an instant to the second",
	});

/** The start time a writer records for the wall-clock instant it read. */
function startTime(wallClock: () => number): string {
	return new Date(wallClock()).toISOString();
}

interface Timed<T> {
	readonly record: T;
	readonly instant: number;
}

interface Partitioned<T> {
	readonly timed: readonly Timed<T>[];
	readonly untimed: readonly T[];
}

function partitioned<T>(
	records: readonly T[],
	timeOf: (record: T) => string | undefined,
): Partitioned<T> {
	const timed: Timed<T>[] = [];
	const untimed: T[] = [];
	for (const record of records) {
		const time = timeOf(record);
		const instant = time === undefined ? undefined : recordedInstant(time);
		if (instant === undefined) {
			untimed.push(record);
		} else {
			timed.push({ instant, record });
		}
	}

	return { timed, untimed };
}

/**
 * Newest first where a record says when it ran, then every record that does
 * not, in the order given. Placing those by file time would claim an order
 * the records never held: most attempt files share one modification second.
 */
function newestFirst<T>(
	records: readonly T[],
	timeOf: (record: T) => string | undefined,
): T[] {
	const { timed, untimed } = partitioned(records, timeOf);

	return [
		...timed
			.toSorted((left, right) => right.instant - left.instant)
			.map(({ record }) => record),
		...untimed,
	];
}

/** Oldest first where a record says when it ran, then the rest as given. */
function oldestFirst<T>(
	records: readonly T[],
	timeOf: (record: T) => string | undefined,
): T[] {
	const { timed, untimed } = partitioned(records, timeOf);

	return [
		...timed
			.toSorted((left, right) => left.instant - right.instant)
			.map(({ record }) => record),
		...untimed,
	];
}

export { startedAtSchema, startTime, newestFirst, oldestFirst };
