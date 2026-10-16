import type { SessionHistoryEvent } from "#benchmark/session-history";

export const EVENT_FILTERS = [
	"Activity",
	"Deliveries",
	"Errors",
	"All records",
] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

export function preferredEvidenceEvent(
	events: readonly SessionHistoryEvent[],
	selected: string | undefined,
): SessionHistoryEvent | undefined {
	return (
		events.find(({ id }) => id === selected) ??
		events.find(
			(event) =>
				event.kind === "instruction-delivery" &&
				event.measurement.state !== "unavailable",
		) ??
		events.find(
			(event) =>
				event.kind !== "unclassified" && event.measurement.state === "complete",
		) ??
		events.find((event) => event.kind !== "unclassified") ??
		events[0]
	);
}

export function filterEvidenceEvents(
	events: readonly SessionHistoryEvent[],
	query: string,
	filter: EventFilter,
): readonly SessionHistoryEvent[] {
	const search = query.trim().toLocaleLowerCase();
	return events.filter((event) => {
		if (filter === "Activity" && event.kind === "unclassified") {
			return false;
		}
		if (
			filter === "Deliveries" &&
			event.kind !== "instruction-delivery" &&
			event.state !== "delivered"
		) {
			return false;
		}
		if (
			filter === "Errors" &&
			!["failed", "partial", "unavailable"].includes(event.state)
		) {
			return false;
		}
		return [
			event.id,
			event.label,
			event.toolName,
			event.sourceId,
			event.timestamp,
		]
			.join(" ")
			.toLocaleLowerCase()
			.includes(search);
	});
}
