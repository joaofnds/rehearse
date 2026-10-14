const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(epochMs: number): number {
	const day = new Date(epochMs);
	day.setHours(0, 0, 0, 0);

	return day.getTime();
}

function clockTime(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** When a record started, as the design's run history reads it: `today 10:04`, `yest 18:52`. */
export function recordMoment(epochMs: number, nowMs: number): string {
	const today = startOfDay(nowMs);

	if (epochMs >= today) {
		return `today ${clockTime(epochMs)}`;
	}
	if (epochMs >= today - DAY_MS) {
		return `yest ${clockTime(epochMs)}`;
	}

	const day = new Date(epochMs).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});

	return `${day} ${clockTime(epochMs)}`;
}
