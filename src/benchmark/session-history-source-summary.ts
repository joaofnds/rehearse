import type { Immutable } from "./contracts";
import type {
	HistoryRegion,
	SessionHistoryEvent,
	SessionHistorySource,
} from "./session-history-contract";
import type { MutableEvent } from "./session-history-event-contract";
import { expectedDeliveryEvents } from "./session-history-event-indices";
import { sourceMeasurement } from "./session-history-measurement";

const INITIAL_SOURCE_DELIVERY_COUNT = 1;

const NO_REPEATED_SOURCE_DELIVERIES = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function sourcesFor(
	events: Immutable<readonly MutableEvent[]>,
	region: HistoryRegion,
): readonly SessionHistorySource[] {
	const grouped = sourceEventsById(events, region);
	return [...grouped].map(([id, sourceEvents]) =>
		summarizeSource({ id, region, sourceEvents }),
	);
}

function publicEvent(event: Immutable<MutableEvent>): SessionHistoryEvent {
	const {
		content: _content,
		snapshot: _snapshot,
		snapshotMeasurement: _snapshotMeasurement,
		snapshotRange: _snapshotRange,
		source: _source,
		isDelivery: _isDelivery,
		input: _input,
		...publicFields
	} = event;

	return publicFields;
}

function sourceEventsById(
	events: Immutable<readonly MutableEvent[]>,
	region: HistoryRegion,
): ReadonlyMap<string, readonly MutableEvent[]> {
	const grouped = new Map<string, MutableEvent[]>();
	for (const event of events) {
		if (event.region === region && event.sourceId !== undefined) {
			const found = grouped.get(event.sourceId) ?? [];
			found.push(event);
			grouped.set(event.sourceId, found);
		}
	}

	return grouped;
}

interface SourceEvents {
	readonly id: string;
	readonly sourceEvents: Immutable<readonly MutableEvent[]>;
	readonly region: HistoryRegion;
}

function summarizeSource({
	id,
	sourceEvents,
	region,
}: SourceEvents): SessionHistorySource {
	const [first] = sourceEvents;
	if (first === undefined) {
		throw new Error(`Source ${id} has no event`);
	}
	const identity = sourceEvents.find(
		({ source: eventSource }) => eventSource !== undefined,
	)?.source;
	const observedDeliveryCount = sourceEvents.filter(
		({ isDelivery }) => isDelivery,
	).length;
	const missingDeliveries = missingSourceDeliveries(sourceEvents);
	const countsAvailable = region !== "boundary-unknown";

	return {
		eventIds: sourceEvents.map(({ id: eventId }) => eventId),
		failedOccurrences: sourceEvents.filter(({ state }) => state === "failed")
			.length,
		firstLocator: first.locator,
		id,
		kind: identity?.kind ?? "unclassified",
		measurement: sourceMeasurement(sourceEvents),
		missingOccurrences: missingDeliveries,
		name: identity?.name ?? "Unclassified recorded content",
		observedDeliveryCount: countsAvailable ? observedDeliveryCount : undefined,
		partialOccurrences: sourceEvents.filter(({ state }) => state === "partial")
			.length,
		path: identity?.path,
		region,
		repeatDeliveryCount: countsAvailable
			? Math.max(
					NO_REPEATED_SOURCE_DELIVERIES,
					observedDeliveryCount - INITIAL_SOURCE_DELIVERY_COUNT,
				)
			: undefined,
		unavailableOccurrences: sourceEvents.filter(
			({ kind, state }) => kind !== "call" && state === "unavailable",
		).length,
	};
}

function missingSourceDeliveries(
	sourceEvents: Immutable<readonly MutableEvent[]>,
): number {
	const missingDeliveries = sourceEvents.filter(
		(event) =>
			event.kind === "call" &&
			(event.toolName === "Read" || event.toolName === "Skill") &&
			expectedDeliveryEvents(event, sourceEvents).length ===
				EMPTY_COLLECTION_LENGTH &&
			!sourceEvents.some(
				(candidate) =>
					event.relatedEventIds.includes(candidate.id) &&
					candidate.state === "failed",
			),
	).length;
	return missingDeliveries;
}

export { publicEvent, sourcesFor };
