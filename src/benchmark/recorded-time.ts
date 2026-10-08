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

	const instant = Date.parse(
		`${parts["date"]}T${parts["hours"]}:${parts["minutes"]}:${parts["seconds"]}Z`,
	);

	return Number.isNaN(instant) ? undefined : instant;
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
	const instantOf = (record: T): number | undefined => {
		const time = timeOf(record);

		return time === undefined ? undefined : recordedInstant(time);
	};
	const timed = records.flatMap((record) => {
		const instant = instantOf(record);

		return instant === undefined ? [] : [{ record, instant }];
	});
	const untimed = records.filter((record) => instantOf(record) === undefined);

	return [
		...timed
			.toSorted((left, right) => right.instant - left.instant)
			.map(({ record }) => record),
		...untimed,
	];
}
