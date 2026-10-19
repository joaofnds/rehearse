import type { Immutable } from "./contracts";
import type { MutableEvent } from "./session-history-event-contract";

function joinKey(event: Immutable<MutableEvent>): string | undefined {
	return event.toolUseId === undefined
		? undefined
		: `${event.region}:${event.toolUseId}`;
}

function byRegionAndId(
	events: Immutable<readonly MutableEvent[]>,
	kind: "call" | "result" | "instruction-delivery",
): ReadonlyMap<string, readonly MutableEvent[]> {
	const grouped = new Map<string, MutableEvent[]>();
	for (const event of events) {
		if (event.kind === kind && event.toolUseId !== undefined) {
			const key = `${event.region}:${event.toolUseId}`;
			const found = grouped.get(key) ?? [];
			found.push(event);
			grouped.set(key, found);
		}
	}

	return grouped;
}

function expectedDeliveryEvents(
	call: Immutable<MutableEvent>,
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	const expectedKind =
		call.toolName === "Read" ? "result" : "instruction-delivery";

	return events.filter(
		(candidate) =>
			candidate.kind === expectedKind &&
			call.relatedEventIds.includes(candidate.id),
	);
}

export { joinKey, expectedDeliveryEvents, byRegionAndId };
