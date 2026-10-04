/** A moment as run detail shows it: day, month, hour and minute in the viewer's locale. */
export function momentReading(epochMs: number): string {
	return new Date(epochMs).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}
