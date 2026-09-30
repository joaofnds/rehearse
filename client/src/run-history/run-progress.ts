const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * How long a run has been going, at the coarsest unit that still moves while
 * an operator watches. A run is minutes to hours long, so seconds past the
 * first minute would be noise, but a run in its first minute would otherwise
 * sit at "0m" long enough to look stuck.
 */
export function elapsedReading(elapsedMs: number): string {
	const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND);
	if (totalSeconds < SECONDS_PER_MINUTE) {
		return `${String(totalSeconds)}s`;
	}

	const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	if (totalMinutes < MINUTES_PER_HOUR) {
		return `${String(totalMinutes)}m`;
	}

	const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	const minutes = totalMinutes % MINUTES_PER_HOUR;

	return `${String(hours)}h ${String(minutes)}m`;
}

function twoDigits(value: number): string {
	return String(value).padStart(2, "0");
}

/**
 * Elapsed time as a clock, `06:12`, with hours only once there are any. The
 * seconds are always shown, because the reading ticks every second.
 */
export function clockReading(elapsedMs: number): string {
	const totalSeconds = Math.floor(elapsedMs / MS_PER_SECOND);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;
	const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const minutes = totalMinutes % MINUTES_PER_HOUR;
	const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	if (hours === 0) {
		return `${twoDigits(minutes)}:${twoDigits(seconds)}`;
	}

	return `${String(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/**
 * A recorded elapsed figure carried forward to now. A run measures its own
 * elapsed time only when it emits an event, once per agent turn, so the
 * recorded figure alone would hold still for minutes while the run goes on.
 * Adding the time since the measurement keeps the reading moving without
 * inventing one: the run's own figure remains the floor, so a clock behind
 * the run's, or an unreadable measurement time, leaves the reading where the
 * run put it rather than running it backwards.
 */
export function liveElapsedMs(
	elapsedMs: number,
	measuredAt: string,
	nowMs: number,
): number {
	const measured = Date.parse(measuredAt);
	if (Number.isNaN(measured)) {
		return elapsedMs;
	}

	return Math.max(elapsedMs, elapsedMs + (nowMs - measured));
}

/**
 * Cents are the unit a spend reading moves in, so they are always shown: a
 * figure that rounded to whole dollars would sit unchanged through most of a
 * stage.
 */
export function spendReading(spentUsd: number): string {
	return `$${spentUsd.toFixed(2)}`;
}
