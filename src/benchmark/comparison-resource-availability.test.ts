import { describe, expect, it } from "bun:test";

import ResourceProjections from "./comparison-resource-test-fixtures";
import buildComparisonResources from "./comparison-resources";

const expectedCandidateReps = [
	{
		cacheReadTokens: 6,
		cacheWriteTokens: 8,
		costUsd: 2,
		inputTokens: 20,
		outputTokens: 4,
		workerTurns: 2,
	},
	{
		cacheReadTokens: 12,
		cacheWriteTokens: 16,
		costUsd: 4,
		inputTokens: 40,
		outputTokens: 8,
		workerTurns: 4,
	},
	{
		cacheReadTokens: 18,
		cacheWriteTokens: 24,
		costUsd: 6,
		inputTokens: 60,
		outputTokens: 12,
		workerTurns: 6,
	},
	{
		cacheReadTokens: 24,
		cacheWriteTokens: 32,
		costUsd: 8,
		inputTokens: 80,
		outputTokens: 16,
		workerTurns: 8,
	},
];
const EXPECTED_CANDIDATE_RESOURCES = {
	completeReps: 4,
	missingMetricReps: 0,
	status: "AVAILABLE",
	total: {
		cacheReadTokens: {
			mean: 15,
			values: expectedCandidateReps.map(
				({ cacheReadTokens }) => cacheReadTokens,
			),
		},
		cacheWriteTokens: {
			mean: 20,
			values: expectedCandidateReps.map(
				({ cacheWriteTokens }) => cacheWriteTokens,
			),
		},
		costUsd: {
			mean: 5,
			values: expectedCandidateReps.map(({ costUsd }) => costUsd),
		},
		inputTokens: {
			mean: 50,
			values: expectedCandidateReps.map(({ inputTokens }) => inputTokens),
		},
		outputTokens: {
			mean: 10,
			values: expectedCandidateReps.map(({ outputTokens }) => outputTokens),
		},
	},
	workerTurns: {
		mean: 5,
		values: expectedCandidateReps.map(({ workerTurns }) => workerTurns),
	},
};

function reportsCompleteCandidateMeans(): void {
	const request = ResourceProjections.missing();

	const report = buildComparisonResources(request);
	const [observedFirstCase] = report.cases;

	expect(observedFirstCase?.arms.candidate).toMatchObject(
		EXPECTED_CANDIDATE_RESOURCES,
	);
}

function reportsMissingControlEvidence(): void {
	const request = ResourceProjections.missing();

	const report = buildComparisonResources(request);
	const [observedFirstCase] = report.cases;

	expect(observedFirstCase?.arms.control).toEqual({
		completeReps: 3,
		missingEvidence: [
			{
				missing: ["stage-judge call metrics"],
				ordinal: 2,
				repId: "case-1-control-rep-2",
			},
		],
		missingMetricReps: 1,
		status: "UNAVAILABLE",
	});
}

function retainsAvailableContrast(): void {
	const request = ResourceProjections.missing();

	const report = buildComparisonResources(request);

	expect(report.contrasts.candidateMinusBaseline.resources).toMatchObject({
		status: "AVAILABLE",
		total: {
			costUsd: {
				caseDeltas: [
					{ caseId: "case-1", value: 2.5 },
					{ caseId: "case-2", value: 5 },
				],
				meanDelta: 3.75,
				standardError: 1.25,
			},
		},
	});
}

function reportsUnavailableContrastEvidence(): void {
	const request = ResourceProjections.missing();

	const report = buildComparisonResources(request);

	expect(report.contrasts.candidateMinusControl.resources).toEqual({
		missingEvidence: [
			{
				arm: "control",
				caseId: "case-1",
				missing: ["stage-judge call metrics"],
				ordinal: 2,
				repId: "case-1-control-rep-2",
			},
		],
		status: "UNAVAILABLE",
	});
}

function marksBaselineControlUnavailable(): void {
	const request = ResourceProjections.missing();

	const report = buildComparisonResources(request);

	expect(report.contrasts.baselineMinusControl.resources.status).toBe(
		"UNAVAILABLE",
	);
}
describe(buildComparisonResources.name, () => {
	describe("when a control rep lacks call metrics", () => {
		it("reports complete candidate means", reportsCompleteCandidateMeans);
		it(
			"reports the missing control metric evidence",
			reportsMissingControlEvidence,
		);
		it(
			"retains the available candidate versus baseline contrast",
			retainsAvailableContrast,
		);
		it(
			"reports missing evidence for candidate versus control",
			reportsUnavailableContrastEvidence,
		);
		it(
			"marks baseline versus control unavailable",
			marksBaselineControlUnavailable,
		);
	});
});
