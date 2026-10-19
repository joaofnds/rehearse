import { describe, expect, it } from "bun:test";

import {
	contextEvidenceSchema,
	contextEvidenceSourceSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";
import {
	buildSessionAttemptRecord,
	parseSessionAttemptRecord,
	sessionAttemptRecordSchema,
} from "#benchmark/session-record";

import {
	record,
	recordInputs,
	smokeAttempt,
} from "./session-record-test-fixtures";

function acceptsAHistoricalRecordWithNoTranscriptDiagnostics(): void {
	expect(
		sessionAttemptRecordSchema.parse(record()).transcriptDiagnostics,
	).toBeUndefined();
}

function treatsOmittedContextEvidenceAsUnavailableRatherThanZero(): void {
	const parsed = sessionAttemptRecordSchema.parse(record());

	expect(parsed.contextEvidence).toBeUndefined();
}

async function reopensTheNormalizedContextEvidenceSavedWithAnAttempt(): Promise<void> {
	const source = contextEvidenceSourceSchema.parse(
		await Bun.file(
			new URL("__fixtures__/context-evidence-source.json", import.meta.url),
		).json(),
	);
	const contextEvidence = normalizeContextEvidence(source);

	const parsed = parseSessionAttemptRecord(
		JSON.stringify({ ...record(), contextEvidence }),
	);

	const reopened = contextEvidenceSchema.parse(
		structuredClone(contextEvidence),
	);

	expect(parsed.contextEvidence).toEqual(reopened);
}

function keepsThePersistedTranscriptCutWithoutConsultingACurrentCaseDeclaration(): void {
	const expectedPrefixLinesExcluded = 2;

	const parsed = parseSessionAttemptRecord(
		JSON.stringify(
			record({
				transcriptDiagnostics: {
					issues: [],
					measuredLineCount: 3,
					prefixLinesExcluded: 2,
					repeatedBashCommands: [],
					sourceLineCount: 5,
					state: "complete",
					toolErrors: [],
					toolUseOccurrences: { byName: [], total: 0 },
				},
			}),
		),
	);

	expect(parsed.transcriptDiagnostics?.prefixLinesExcluded).toBe(
		expectedPrefixLinesExcluded,
	);
}

function retainsTheProviderSPerModelUsageBlockOnABuiltRecord(): void {
	const built = buildSessionAttemptRecord(
		recordInputs({
			attempt: {
				...smokeAttempt(),
				metrics: {
					cacheReadTokens: 0,
					cacheWriteTokens: 14_973,
					costUsd: 0.029973,
					inputTokens: 2,
					modelUsage: {
						"claude-haiku-4-5-20251001": {
							cacheCreationInputTokens: 14_973,
							cacheReadInputTokens: 0,
							canonicalModel: "claude-haiku-4-5",
							contextWindow: 200_000,
							costBasis: "list",
							costUSD: 0.029973,
							inputTokens: 2,
							maxOutputTokens: 32_000,
							outputTokens: 5,
							provider: "firstParty",
						},
					},
					outputTokens: 5,
					turns: 1,
				},
			},
			elapsedMs: 123,
		}),
	);

	const roundtripped = parseSessionAttemptRecord(JSON.stringify(built));

	expect(roundtripped.metrics?.modelUsage).toEqual({
		"claude-haiku-4-5-20251001": {
			cacheCreationInputTokens: 14_973,
			cacheReadInputTokens: 0,
			canonicalModel: "claude-haiku-4-5",
			contextWindow: 200_000,
			costBasis: "list",
			costUSD: 0.029973,
			inputTokens: 2,
			maxOutputTokens: 32_000,
			outputTokens: 5,
			provider: "firstParty",
		},
	});
}
describe("sessionAttemptRecordSchema", () => {
	it(
		"accepts a historical record with no transcript diagnostics",
		acceptsAHistoricalRecordWithNoTranscriptDiagnostics,
	);
	it(
		"treats omitted context evidence as unavailable rather than zero",
		treatsOmittedContextEvidenceAsUnavailableRatherThanZero,
	);
	it(
		"reopens the normalized context evidence saved with an attempt",
		reopensTheNormalizedContextEvidenceSavedWithAnAttempt,
	);
	it(
		"keeps the persisted transcript cut without consulting a current case declaration",
		keepsThePersistedTranscriptCutWithoutConsultingACurrentCaseDeclaration,
	);
	it(
		"retains the provider's per-model usage block on a built record",
		retainsTheProviderSPerModelUsageBlockOnABuiltRecord,
	);
});
