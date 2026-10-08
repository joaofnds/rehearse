import { z } from "zod";

const RECORDED_TIME =
	/^(?<date>\d{4}-\d{2}-\d{2})T(?<hours>\d{2})(?<separator>[-:])(?<minutes>\d{2})\k<separator>(?<seconds>\d{2}(?:\.\d+)?)Z$/u;

/**
 * The instant a run name, a replay timestamp or a recorded start time names,
 * or undefined when the text names none, as a run directory may carry any
 * name. Records compare by this rather than as text: a run name replaces the
 * colons a start time keeps, so text order misplaces them within an hour.
 */
export function recordedInstant(time: string): number | undefined {
	const parts = RECORDED_TIME.exec(time)?.groups;
	if (parts === undefined) {
		return undefined;
	}

	const named = `${parts["date"]}T${parts["hours"]}:${parts["minutes"]}:${parts["seconds"]}Z`;
	const instant = Date.parse(named);
	if (Number.isNaN(instant)) {
		return undefined;
	}

	// Date.parse rolls a day or hour that does not exist into the next one.
	const toTheSecond = named.slice(0, "2026-01-01T00:00:00".length);

	return new Date(instant).toISOString().startsWith(toTheSecond)
		? instant
		: undefined;
}

/**
 * The start time an attempt or group records: an ISO instant every reader
 * can place, so a record never shows a time it is not ordered by.
 */
export const startedAtSchema = z.iso
	.datetime()
	.refine((time) => recordedInstant(time) !== undefined, {
		message: "Expected an instant to the second",
	});

/** The start time a writer records for the wall-clock instant it read. */
export function startTime(wallClock: () => number): string {
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
			timed.push({ record, instant });
		}
	}

	return { timed, untimed };
}

/**
 * Newest first where a record says when it ran, then every record that does
 * not, in the order given. Placing those by file time would claim an order
 * the records never held: most attempt files share one modification second.
 */
export function newestFirst<T>(
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
export function oldestFirst<T>(
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
