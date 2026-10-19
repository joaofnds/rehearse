import type { Immutable } from "./contracts";
import type {
	JoinedEvent,
	MutableEvent,
	ProjectionState,
} from "./session-history-event-contract";
import {
	byRegionAndId,
	expectedDeliveryEvents,
	joinKey,
} from "./session-history-event-indices";
import { joinCall, joinNonCall } from "./session-history-event-joins";

const EMPTY_COLLECTION_LENGTH = 0;

const NO_SOURCE_DELIVERIES = 0;

const SOURCE_DELIVERY_ORDINAL_STEP = 1;

const FIRST_SOURCE_DELIVERY_ORDINAL = 1;

function missingDeliveryIssues(
	events: Immutable<readonly MutableEvent[]>,
): readonly string[] {
	return events.flatMap((event) => {
		const expectsDelivery =
			event.toolName === "Read" || event.toolName === "Skill";
		const key = joinKey(event);
		if (event.kind !== "call" || !expectsDelivery || key === undefined) {
			return [];
		}
		const candidates = expectedDeliveryEvents(event, events);
		const failed = events.some(
			(candidate) =>
				event.relatedEventIds.includes(candidate.id) &&
				candidate.state === "failed",
		);

		return candidates.length > EMPTY_COLLECTION_LENGTH || failed
			? []
			: [`missing delivery for ${event.id}`];
	});
}

function markUnavailableDeliveries(
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	return events.map((event) => {
		if (
			event.kind !== "call" ||
			(event.toolName !== "Read" && event.toolName !== "Skill")
		) {
			return event;
		}
		const related = events.filter((candidate) =>
			event.relatedEventIds.includes(candidate.id),
		);
		if (
			expectedDeliveryEvents(event, events).length > EMPTY_COLLECTION_LENGTH ||
			related.some(({ state }) => state === "failed")
		) {
			return event;
		}

		return {
			...event,
			label: `${event.toolName} invoked · delivery unavailable`,
			state: "unavailable",
		};
	});
}

function numberDeliveries(
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	const ordinals = new Map<string, number>();

	return events.map((event) => {
		if (
			!event.isDelivery ||
			event.sourceId === undefined ||
			event.region === "boundary-unknown"
		) {
			return event;
		}
		const key = `${event.region}:${event.sourceId}`;
		const next =
			(ordinals.get(key) ?? NO_SOURCE_DELIVERIES) +
			SOURCE_DELIVERY_ORDINAL_STEP;
		ordinals.set(key, next);

		return {
			...event,
			deliveryOrdinal: next,
			label: `${event.label} · ${next === FIRST_SOURCE_DELIVERY_ORDINAL ? "first" : "subsequent"}`,
		};
	});
}

/** A slash command loads a skill's body with no tool call to join it to. */
function isSlashCommandDelivery(event: Immutable<MutableEvent>): boolean {
	return event.kind === "instruction-delivery" && event.toolUseId === undefined;
}

function joinEvents(state: Immutable<ProjectionState>): ProjectionState {
	const indices = {
		calls: byRegionAndId(state.events, "call"),
		deliveries: byRegionAndId(state.events, "instruction-delivery"),
		results: byRegionAndId(state.events, "result"),
	};
	const joined = state.events.map((event): JoinedEvent => {
		if (event.kind === "unclassified" || isSlashCommandDelivery(event)) {
			return { event, issues: [] };
		}

		return event.kind === "call"
			? joinCall(event, indices)
			: joinNonCall(event, indices, state.events);
	});
	const joinedEvents = joined.map(({ event }) => event);
	const events = numberDeliveries(markUnavailableDeliveries(joinedEvents));

	return {
		events,
		issues: [
			...state.issues,
			...joined.flatMap(({ issues }) => issues),
			...missingDeliveryIssues(events),
			...events.flatMap((event) =>
				event.kind !== "result" || event.measurement.state === "complete"
					? []
					: event.measurement.reasons.map(
							(reason) => `${reason} at ${event.id}`,
						),
			),
		],
	};
}

export { joinEvents as default };
