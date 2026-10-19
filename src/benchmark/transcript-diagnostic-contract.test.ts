import { describe, expect, it } from "bun:test";

import {
	parseTranscript,
	transcriptDiagnostics,
	transcriptDiagnosticsSchema,
} from "#benchmark/transcript";

import { line, repeatedDiagnosticsFixture } from "./transcript-test-fixtures";

const OVER_LIMIT_PREVIEW_CHARACTERS = 161;

function rejectsContradictoryPersistedCompletenessStates(): void {
	const complete = transcriptDiagnostics({
		lines: parseTranscript(
			line({ message: { content: "hello" }, type: "user" }),
		),
		prefixLinesExcluded: 0,
		sourceAvailable: true,
	});
	const issue = {
		kind: "invalid-json" as const,
		locations: [{ block: 1, line: 1 }],
		locationsTruncated: false,
		occurrences: 1,
	};

	expect(
		transcriptDiagnosticsSchema.safeParse({ ...complete, issues: [issue] })
			.success,
	).toBe(false);
	expect(
		transcriptDiagnosticsSchema.safeParse({
			...complete,
			issues: [],
			state: "partial",
		}).success,
	).toBe(false);
}

function rejectsContradictoryPersistedCountsRepeatIdentitiesOrderAndPreviewBounds(): void {
	const { complete, repeat } = repeatedDiagnosticsFixture();

	expect(
		transcriptDiagnosticsSchema.safeParse({
			...complete,
			toolUseOccurrences: { ...complete.toolUseOccurrences, total: 1 },
		}).success,
	).toBe(false);
	expect(
		transcriptDiagnosticsSchema.safeParse({
			...complete,
			repeatedBashCommands: [
				{
					...repeat,
					occurrences: repeat.occurrences.map((occurrence) => ({
						...occurrence,
						toolUseId: "duplicate",
					})),
				},
			],
		}).success,
	).toBe(false);
	expect(
		transcriptDiagnosticsSchema.safeParse({
			...complete,
			repeatedBashCommands: [
				{ ...repeat, occurrences: repeat.occurrences.toReversed() },
			],
		}).success,
	).toBe(false);
	expect(
		transcriptDiagnosticsSchema.safeParse({
			...complete,
			repeatedBashCommands: [
				{ ...repeat, preview: "x".repeat(OVER_LIMIT_PREVIEW_CHARACTERS) },
			],
		}).success,
	).toBe(false);
}

describe(transcriptDiagnostics.name, () => {
	it(
		"rejects contradictory persisted completeness states",
		rejectsContradictoryPersistedCompletenessStates,
	);
	it(
		"rejects contradictory persisted counts, repeat identities, order, and preview bounds",
		rejectsContradictoryPersistedCountsRepeatIdentitiesOrderAndPreviewBounds,
	);
});
