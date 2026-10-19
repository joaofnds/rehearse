const SECOND_FIELD_DIGITS = 2;

const MS_PER_SECOND = 1000;

const SECONDS_PER_MINUTE = 60;

function minutesAndSeconds(ms: number): string {
	const totalSeconds = Math.floor(ms / MS_PER_SECOND);
	const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
	const seconds = totalSeconds % SECONDS_PER_MINUTE;

	return `${String(minutes)}m${String(seconds).padStart(SECOND_FIELD_DIGITS, "0")}s`;
}

export { minutesAndSeconds as default };
