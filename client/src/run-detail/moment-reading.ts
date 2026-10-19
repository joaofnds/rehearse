/** A moment as run detail shows it: day, month, hour and minute in the viewer's locale. */
function momentReading(epochMs: number): string {
	return new Date(epochMs).toLocaleString(undefined, {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
	});
}

export { momentReading as default };
