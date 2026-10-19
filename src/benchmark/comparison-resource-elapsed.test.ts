import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";

import ResourceProjections from "./comparison-resource-test-fixtures";
import buildComparisonResources from "./comparison-resources";

function summarizesElapsedObservations(): void {
	const expectedShortBaselineDurationMs = 1000;
	const expectedLongBaselineDurationMs = 3000;
	const request = ResourceProjections.elapsed();

	const report = buildComparisonResources(request);
	const [firstCase] = report.cases;
	const baseline = firstCase?.arms.baseline;

	assert.ok(
		baseline?.status === "AVAILABLE",
		"baseline resources should be available",
	);
	expect(baseline.elapsedMs).toEqual({
		mean: 2000,
		values: [expectedShortBaselineDurationMs, expectedLongBaselineDurationMs],
	});
}

function estimatesPairedElapsedContrast(): void {
	const request = ResourceProjections.pairedElapsed();

	const report = buildComparisonResources(request);
	const { resources } = report.contrasts.candidateMinusBaseline;

	assert.ok(
		resources.status === "AVAILABLE",
		"candidate minus baseline resources should be available",
	);
	expect(resources.elapsedMs).toEqual({
		caseDeltas: [
			{ caseId: "case-1", value: 500 },
			{ caseId: "case-2", value: 1000 },
		],
		meanDelta: 750,
		standardError: 250,
	});
	expect(resources.elapsedMs).not.toEqual(resources.workerTurns);
}

describe(buildComparisonResources.name, () => {
	describe("when reps record distinct durations", () => {
		it(
			"summarises each arm's per-attempt elapsed time from its reps",
			summarizesElapsedObservations,
		);
		it(
			"estimates a paired elapsed contrast across cases from each arm's durations",
			estimatesPairedElapsedContrast,
		);
	});
});
