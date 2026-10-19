import type { Immutable } from "./contracts";
import type { HistoryEventState } from "./session-history-contract";
import type {
	JoinIndices,
	JoinedEvent,
	MutableEvent,
	SourceIdentity,
} from "./session-history-event-contract";
import { joinKey } from "./session-history-event-indices";
import { sourceForResult, unclassifiedSource } from "./session-history-sources";

const SINGLE_ITEM_COUNT = 1;

function joinCall(
	event: Immutable<MutableEvent>,
	indices: Readonly<JoinIndices>,
): JoinedEvent {
	const key = joinKey(event);
	if (key === undefined) {
		return { event, issues: [`missing tool call ID at ${event.id}`] };
	}
	const ambiguous = (indices.calls.get(key) ?? []).length !== SINGLE_ITEM_COUNT;

	return {
		event: {
			...event,
			relatedEventIds: [
				...(indices.results.get(key) ?? []).map(({ id }) => id),
				...(indices.deliveries.get(key) ?? []).map(({ id }) => id),
			],
			state: ambiguous ? "partial" : event.state,
		},
		issues: ambiguous ? [`ambiguous tool call ${event.toolUseId}`] : [],
	};
}

function joinUnmatchedEvent(
	event: Immutable<MutableEvent>,
	events: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const contextualCalls = events.filter(
		(candidate) =>
			candidate.kind === "call" &&
			candidate.toolUseId === event.toolUseId &&
			candidate.region !== event.region,
	);
	const [contextualCall] =
		contextualCalls.length === SINGLE_ITEM_COUNT ? contextualCalls : [];
	const source = unclassifiedSource();

	return {
		event: {
			...event,
			label: `${event.kind === "result" ? "Tool result" : "Skill delivery"} · partial`,
			relatedEventIds: contextualCall === undefined ? [] : [contextualCall.id],
			source,
			sourceId: source.id,
			state: "partial",
		},
		issues: [`unmatched or ambiguous result ${event.id}`],
	};
}

function joinInstructionDelivery(
	event: Immutable<MutableEvent>,
	call: Immutable<MutableEvent>,
	deliveryMatches: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const ambiguous =
		call.toolName !== "Skill" || deliveryMatches.length !== SINGLE_ITEM_COUNT;

	return {
		event: {
			...event,
			isDelivery: !ambiguous,
			label: ambiguous ? "Skill delivery · partial" : "Skill delivered",
			relatedEventIds: [call.id],
			source: ambiguous ? unclassifiedSource() : call.source,
			sourceId: ambiguous ? "unclassified" : call.sourceId,
			state: ambiguous ? "partial" : "delivered",
		},
		issues: ambiguous ? [`ambiguous Skill delivery ${event.id}`] : [],
	};
}

function joinResult(
	event: Immutable<MutableEvent>,
	call: Immutable<MutableEvent>,
	resultMatches: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const source = sourceForResult(call);
	const ambiguous = resultMatches.length !== SINGLE_ITEM_COUNT;
	if (event.state === "failed") {
		return failedToolResult({ ambiguous, call, event, source });
	}
	const delivered =
		call.toolName === "Read" &&
		!ambiguous &&
		event.measurement.state !== "unavailable";
	const unavailable = event.measurement.state === "unavailable";
	const resultState = resultDeliveryState({
		ambiguous,
		delivered,
		unavailable,
	});

	return {
		event: {
			...event,
			isDelivery: delivered,
			label: delivered
				? "Read delivered"
				: `${call.toolName ?? "Tool"} result${ambiguous ? " · partial" : ""}`,
			relatedEventIds: [call.id],
			source,
			sourceId: source?.id,
			state: resultState,
			toolName: call.toolName,
		},
		issues: ambiguous
			? [
					`ambiguous tool result ${event.toolUseId ?? "without ID"} at ${event.id}`,
				]
			: [],
	};
}

function joinNonCall(
	event: Immutable<MutableEvent>,
	indices: Readonly<JoinIndices>,
	events: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const key = joinKey(event);
	const callMatches = key === undefined ? [] : (indices.calls.get(key) ?? []);
	const [call] = callMatches.length === SINGLE_ITEM_COUNT ? callMatches : [];
	if (call === undefined) {
		return joinUnmatchedEvent(event, events);
	}
	if (event.kind === "instruction-delivery") {
		return joinInstructionDelivery(
			event,
			call,
			key === undefined ? [] : (indices.deliveries.get(key) ?? []),
		);
	}

	return joinResult(
		event,
		call,
		key === undefined ? [] : (indices.results.get(key) ?? []),
	);
}

interface ResultDelivery {
	readonly ambiguous: boolean;
	readonly delivered: boolean;
	readonly unavailable: boolean;
}

function resultDeliveryState({
	ambiguous,
	delivered,
	unavailable,
}: ResultDelivery): HistoryEventState {
	if (ambiguous) {
		return "partial";
	}
	if (delivered) {
		return "delivered";
	}
	if (unavailable) {
		return "unavailable";
	}
	return "recorded";
}

interface FailedToolResult {
	readonly event: Immutable<MutableEvent>;
	readonly call: Immutable<MutableEvent>;
	readonly source: SourceIdentity | undefined;
	readonly ambiguous: boolean;
}

function failedToolResult({
	event,
	call,
	source,
	ambiguous,
}: FailedToolResult): JoinedEvent {
	return {
		event: {
			...event,
			label: `${call.toolName ?? "Tool"} result · failed`,
			relatedEventIds: [call.id],
			source,
			sourceId: source?.id,
			toolName: call.toolName,
		},
		issues: ambiguous
			? [
					`ambiguous tool result ${event.toolUseId ?? "without ID"} at ${event.id}`,
				]
			: [],
	};
}

export { joinCall, joinNonCall };
