import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import { call, result, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

const FIRST_DELIVERY_ORDINAL = 1;

const FIRST_ATTEMPT_EVENT_INDEX = 0;

const SECOND_STARTING_CONTEXT_SOURCE_INDEX = 1;

const SECOND_BOUNDARY_UNKNOWN_SOURCE_INDEX = 1;

const repeatedReadTranscript = [
	row(call("read-0", "Read", { file_path: "/work/CLAUDE.md" })),
	row(result("read-0", "1\tinherited")),
	row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
	row(result("read-1", "1\talpha", { snapshot: "alpha" })),
	row(call("read-2", "Read", { file_path: "/work/CLAUDE.md" })),
	row(result("read-2", "1\talpha", { snapshot: "alpha" })),
].join("\n");

function separatesInheritedAndRepeatedReadDeliveriesInSourceOrder(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 2,
		resolvedCorpusFiles: [],
		transcript: repeatedReadTranscript,
	});

	expect(report.evidence).toEqual({ state: "complete" });
	expect(report.boundary).toBe("known");
	expect(report.startingContext.map(({ id }) => id)).toEqual(["1:1", "2:1"]);
	expect(
		report.startingContext.at(SECOND_STARTING_CONTEXT_SOURCE_INDEX)
			?.deliveryOrdinal,
	).toBe(FIRST_DELIVERY_ORDINAL);
	expect(
		report.startingContext.at(SECOND_STARTING_CONTEXT_SOURCE_INDEX)?.label,
	).toBe("Read delivered · first");
	expect(report.attemptEvents.map(({ id, state }) => ({ id, state }))).toEqual([
		{ id: "3:1", state: "invoked" },
		{ id: "4:1", state: "delivered" },
		{ id: "5:1", state: "invoked" },
		{ id: "6:1", state: "delivered" },
	]);
	expect(report.attemptEvents[FIRST_ATTEMPT_EVENT_INDEX]?.measurement).toEqual({
		reasons: ["tool invocation carries no result content"],
		state: "unavailable",
	});
	expect(
		report.attemptEvents
			.filter(({ state }) => state === "delivered")
			.map(({ deliveryOrdinal, label }) => ({ deliveryOrdinal, label })),
	).toEqual([
		{ deliveryOrdinal: 1, label: "Read delivered · first" },
		{ deliveryOrdinal: 2, label: "Read delivered · subsequent" },
	]);
	expect(report.sources).toEqual([
		expect.objectContaining({
			failedOccurrences: 0,
			kind: "project",
			measurement: { characters: 14, state: "complete" },
			missingOccurrences: 0,
			name: "CLAUDE.md",
			observedDeliveryCount: 2,
			partialOccurrences: 0,
			repeatDeliveryCount: 1,
			unavailableOccurrences: 0,
		}),
	]);
}

function keepsNoCutRowsInspectableWithoutInventingActivityTotals(): void {
	const transcript = [
		row(call("read-1", "Read", { file_path: "/work/notes.md" })),
		row(result("read-1", "notes")),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: undefined,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.evidence).toEqual({
		reasons: ["attempt boundary unavailable"],
		state: "partial",
	});
	expect(report.boundary).toBe("unknown");
	expect(report.startingContext).toEqual([]);
	expect(report.attemptEvents).toEqual([]);
	expect(report.boundaryUnknown.map(({ id }) => id)).toEqual(["1:1", "2:1"]);
	expect(
		report.boundaryUnknown.at(SECOND_BOUNDARY_UNKNOWN_SOURCE_INDEX)?.label,
	).toBe("Read delivered");
	expect(
		report.boundaryUnknown[SECOND_BOUNDARY_UNKNOWN_SOURCE_INDEX]
			?.deliveryOrdinal,
	).toBeUndefined();
	expect(report.sources).toEqual([
		expect.objectContaining({
			measurement: { characters: 5, state: "complete" },
			observedDeliveryCount: undefined,
			region: "boundary-unknown",
			repeatDeliveryCount: undefined,
		}),
	]);
}

function keepsAPostCutResultSeparateFromItsInheritedCall(): void {
	const transcript = [
		row(call("read-1", "Read", { file_path: "/work/notes.md" })),
		row(result("read-1", "entered after the cut")),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 1,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.attemptEvents).toEqual([
		expect.objectContaining({
			id: "2:1",
			measurement: { characters: 21, state: "complete" },
			relatedEventIds: ["1:1"],
			state: "partial",
		}),
	]);
	expect(report.sources).toEqual([
		expect.objectContaining({
			kind: "unclassified",
			measurement: { characters: 21, state: "complete" },
			observedDeliveryCount: 0,
		}),
	]);
}

describe(sessionHistoryReport.name, () => {
	it(
		"separates inherited and repeated Read deliveries in source order",
		separatesInheritedAndRepeatedReadDeliveriesInSourceOrder,
	);
	it(
		"keeps no-cut rows inspectable without inventing activity totals",
		keepsNoCutRowsInspectableWithoutInventingActivityTotals,
	);
	it(
		"keeps a post-cut result separate from its inherited call",
		keepsAPostCutResultSeparateFromItsInheritedCall,
	);
});
