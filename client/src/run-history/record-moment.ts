const MIDNIGHT_HOUR = 0;

const MIDNIGHT_MILLISECOND = 0;

const MIDNIGHT_MINUTE = 0;

const MIDNIGHT_SECOND = 0;

const DAY_MS = 86_400_000;

function startOfDay(epochMs: number): number {
	const day = new Date(epochMs);
	day.setHours(
		MIDNIGHT_HOUR,
		MIDNIGHT_MINUTE,
		MIDNIGHT_SECOND,
		MIDNIGHT_MILLISECOND,
	);

	return day.getTime();
}

function clockTime(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** When a record started, as the design's run history reads it: `today 10:04`, `yest 18:52`. */
function recordMoment(epochMs: number, nowMs: number): string {
	const today = startOfDay(nowMs);

	if (epochMs >= today) {
		return `today ${clockTime(epochMs)}`;
	}
	if (epochMs >= today - DAY_MS) {
		return `yest ${clockTime(epochMs)}`;
	}

	const day = new Date(epochMs).toLocaleDateString("en-US", {
		day: "numeric",
		month: "short",
	});

	return `${day} ${clockTime(epochMs)}`;
}

export { recordMoment as default };
