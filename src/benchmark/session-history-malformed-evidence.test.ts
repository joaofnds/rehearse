import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import { call, result, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

const SECOND_ATTEMPT_EVENT_INDEX = 1;

function keepsDuplicateResultIDsAsSeparatePartialEvidence(): void {
	const transcript = [
		row(call("read-1", "Read", { file_path: "/work/notes.md" })),
		row(result("read-1", "first body")),
		row(result("read-1", "second body")),
	].join("\n");

	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript,
	});

	expect(report.attemptEvents.map(({ id, state }) => ({ id, state }))).toEqual([
		{ id: "1:1", state: "invoked" },
		{ id: "2:1", state: "partial" },
		{ id: "3:1", state: "partial" },
	]);
	expect(report.evidence).toEqual({
		reasons: [
			"ambiguous tool result read-1 at 2:1",
			"ambiguous tool result read-1 at 3:1",
		],
		state: "partial",
	});
	expect(report.sources).toEqual([
		expect.objectContaining({
			missingOccurrences: 0,
			observedDeliveryCount: 0,
			partialOccurrences: 2,
			unavailableOccurrences: 0,
		}),
	]);
}

function retainsANoContentMessageRowAsUnsupportedLocatorEvidence(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: undefined,
		resolvedCorpusFiles: [],
		transcript: row({ message: { content: [] } }),
	});

	expect(report.boundaryUnknown).toEqual([
		expect.objectContaining({ id: "1:1", state: "recorded" }),
	]);
	expect(report.evidence).toEqual({
		reasons: ["unsupported content at 1:1", "attempt boundary unavailable"],
		state: "partial",
	});
	expect(report.sources).toEqual([
		expect.objectContaining({
			measurement: {
				observedCharacters: 0,
				reasons: ["unsupported text body"],
				state: "partial",
			},
		}),
	]);
}

function makesUnsupportedResultContentPartialAtReportLevel(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: [
			row(call("bash-1", "Bash", { command: "pwd" })),
			row({
				message: {
					content: [
						{
							content: { unsupported: true },
							tool_use_id: "bash-1",
							type: "tool_result",
						},
					],
				},
			}),
		].join("\n"),
	});

	expect(report.attemptEvents.at(SECOND_ATTEMPT_EVENT_INDEX)?.state).toBe(
		"unavailable",
	);
	expect(report.evidence).toEqual({
		reasons: ["unsupported text body at 2:1"],
		state: "partial",
	});
}

describe(sessionHistoryReport.name, () => {
	it(
		"keeps duplicate result IDs as separate partial evidence",
		keepsDuplicateResultIDsAsSeparatePartialEvidence,
	);
	it(
		"retains a no-content message row as unsupported locator evidence",
		retainsANoContentMessageRowAsUnsupportedLocatorEvidence,
	);
	it(
		"makes unsupported result content partial at report level",
		makesUnsupportedResultContentPartialAtReportLevel,
	);
});
