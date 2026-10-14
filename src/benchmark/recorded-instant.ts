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
