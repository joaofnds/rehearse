import { describe, expect, it } from "bun:test";

import { sessionHistoryReport } from "#benchmark/session-history";

import {
	sessionAttempt,
	stageAttempt,
} from "./session-history-test-identities";

const EXPECTED_UNAVAILABLE_REASON_COUNT = 3;

const FIRST_UNAVAILABLE_REASON_INDEX = 0;

function namesWhyRawEvidenceIsUnavailableDistinctlyPerReadableCause(): void {
	const reasons = (
		[
			"provider-wrote-none",
			"no-capture-recorded",
			"recorded-transcript-missing",
		] as const
	).map(
		(unavailableReason) =>
			sessionHistoryReport({
				attempt: stageAttempt,
				prefixLinesExcluded: 0,
				resolvedCorpusFiles: [],
				transcript: undefined,
				unavailableReason,
			}).evidence,
	);

	expect(reasons).toEqual([
		{
			reasons: ["the provider wrote no transcript for this stage session"],
			state: "unavailable",
		},
		{
			reasons: ["no raw transcript capture was recorded for this stage"],
			state: "unavailable",
		},
		{
			reasons: [
				"the checkpoint records a transcript whose file is no longer beside it",
			],
			state: "unavailable",
		},
	]);
	expect(
		new Set(
			reasons.map((evidence) =>
				evidence.state === "unavailable"
					? evidence.reasons.at(FIRST_UNAVAILABLE_REASON_INDEX)
					: undefined,
			),
		).size,
	).toBe(EXPECTED_UNAVAILABLE_REASON_COUNT);
}

function keepsTheSessionWordingWhenNoUnavailableReasonIsSupplied(): void {
	const report = sessionHistoryReport({
		attempt: sessionAttempt,
		prefixLinesExcluded: 0,
		resolvedCorpusFiles: [],
		transcript: undefined,
	});

	expect(report.evidence).toEqual({
		reasons: ["transcript unavailable"],
		state: "unavailable",
	});
}

describe(sessionHistoryReport.name, () => {
	it(
		"names why raw evidence is unavailable, distinctly per readable cause",
		namesWhyRawEvidenceIsUnavailableDistinctlyPerReadableCause,
	);
	it(
		"keeps the session wording when no unavailable reason is supplied",
		keepsTheSessionWordingWhenNoUnavailableReasonIsSupplied,
	);
});
