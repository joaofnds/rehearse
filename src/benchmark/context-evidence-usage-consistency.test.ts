import { describe, expect, it } from "bun:test";

import { normalizeContextEvidence } from "#benchmark/context-evidence";

import { rates } from "./context-evidence-rate-test-fixture";
import {
	alsoObservedByOtel,
	fullUsage,
	objectAt,
	required,
	sourceFixture,
	sourceWithCacheSplit,
	transcriptOnlySource,
} from "./context-evidence-test-support";

const FIRST_TRANSCRIPT_RECORD_INDEX = 0;

async function rejectsMultipleDistinctTTLSplitsEvenWhenEachMatchesTheAggregate(): Promise<void> {
	const source = await sourceFixture();
	const transcriptPath = "transcripts/subagents/agent-agent-review-1.jsonl";
	const child = required(
		source.files.transcripts[transcriptPath]?.[FIRST_TRANSCRIPT_RECORD_INDEX],
		"fixture has no child transcript",
	);
	const message = objectAt(child, "message");
	const usage = objectAt(message, "usage");
	source.files.transcripts[transcriptPath]?.push({
		...child,
		message: {
			...message,
			usage: {
				...usage,
				cache_creation: {
					ephemeral_1h_input_tokens: 300,
					ephemeral_5m_input_tokens: 100,
				},
			},
		},
		uuid: "message-child-duplicate-split",
	});

	const evidence = normalizeContextEvidence(source, rates);

	expect(
		evidence.projection.requests.find(
			(request) => request.requestId === "req-child-1",
		)?.pricing.state,
	).toBe("ttl-split-conflict");
}

const FIRST_PARSED_EVIDENCE_ROW_INDEX = 0;

function reportsConflictWhenOtelAndTheTranscriptDisagreeOnOneRequest(): void {
	const evidence = normalizeContextEvidence(
		alsoObservedByOtel({
			cache_creation_tokens: 440,
			cache_read_tokens: 3300,
			input_tokens: 99,
			output_tokens: 22,
		}),
	);

	const [request] = evidence.projection.requests;

	expect(request?.usageState).toBe("conflict");
	expect(request?.usage).toBeUndefined();
	expect(request?.usageRoute).toBeUndefined();
	expect(request?.pricing).toEqual({ state: "usage-conflict" });
}

function reportsConflictWhenTwoTranscriptRowsDisagreeOnOneRequest(): void {
	const source = transcriptOnlySource(fullUsage);
	const rows = required(
		source.files.transcripts["transcripts/main.jsonl"],
		"fixture has no transcript file",
	);
	const first = required(
		rows[FIRST_PARSED_EVIDENCE_ROW_INDEX],
		"fixture has no transcript row",
	);
	rows.push({
		...first,
		message: {
			model: "claude-sonnet-5",
			usage: { ...fullUsage, input_tokens: 99 },
		},
		uuid: "message-2",
	});

	const evidence = normalizeContextEvidence(source);

	const [request] = evidence.projection.requests;

	expect(request?.usageState).toBe("conflict");
	expect(request?.usage).toBeUndefined();
	expect(request?.usageRoute).toBeUndefined();
}

function keepsAgreeingDuplicateTranscriptRowsAsOneCompleteReading(): void {
	const source = transcriptOnlySource(fullUsage);
	const rows = source.files.transcripts["transcripts/main.jsonl"];
	const first = required(
		rows?.[FIRST_PARSED_EVIDENCE_ROW_INDEX],
		"fixture has no transcript row",
	);
	rows?.push({ ...first, uuid: "message-2" });

	const evidence = normalizeContextEvidence(source);

	const [request] = evidence.projection.requests;

	expect(request?.usageState).toBe("complete");
	expect(request?.usageRoute).toBe("transcript");
}

describe(normalizeContextEvidence.name, () => {
	it.each([
		{
			cache: undefined,
			expected: "ttl-split-missing",
			name: "missing",
		},
		{
			cache: {
				ephemeral_1h_input_tokens: 200,
				ephemeral_5m_input_tokens: 201,
			},
			expected: "ttl-split-conflict",
			name: "conflicting",
		},
	])(
		"keeps a $name cache TTL split incomplete",
		async ({ cache, expected }) => {
			const revisedSource = await sourceWithCacheSplit(cache);

			const evidence = normalizeContextEvidence(revisedSource, rates);

			expect(
				evidence.projection.requests.find(
					(request) => request.requestId === "req-child-1",
				)?.pricing.state,
			).toBe(expected);
		},
	);

	it(
		"rejects multiple distinct TTL splits even when each matches the aggregate",
		rejectsMultipleDistinctTTLSplitsEvenWhenEachMatchesTheAggregate,
	);
});

describe("transcript-supplied request usage", () => {
	it(
		"reports conflict when otel and the transcript disagree on one request",
		reportsConflictWhenOtelAndTheTranscriptDisagreeOnOneRequest,
	);

	it(
		"reports conflict when two transcript rows disagree on one request",
		reportsConflictWhenTwoTranscriptRowsDisagreeOnOneRequest,
	);

	it(
		"keeps agreeing duplicate transcript rows as one complete reading",
		keepsAgreeingDuplicateTranscriptRowsAsOneCompleteReading,
	);
});
