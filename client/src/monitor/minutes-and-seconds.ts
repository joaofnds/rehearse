const MS_PER_SECOND = 1000;

const SECONDS_PER_MINUTE = 60;

export function minutesAndSeconds(ms: number): string {
	const totalSeconds = Math.floor(ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	return `${String(minutes)}m${String(seconds).padStart(2, "0")}s`;
}
