import { describe, expect, it } from "bun:test";

import { buildResourceReport } from "./confirmation-report";
import type { MetricDistributions } from "./confirmation-report";
import ConfirmationResourceRepBuilder from "./confirmation-resource-test-builder";
import type { ClaudeCallMetrics } from "./contracts";

const CONFIRMATION_MAKESPAN_MS = 75;
const expectedRoleObservations = {
	"final-judge": [
		{
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costUsd: 0,
			inputTokens: 0,
			outputTokens: 0,
		},
		{
			cacheReadTokens: 17,
			cacheWriteTokens: 18,
			costUsd: 1.5,
			inputTokens: 15,
			outputTokens: 16,
		},
	],
	"product-owner": [
		{
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costUsd: 0,
			inputTokens: 0,
			outputTokens: 0,
		},
		{
			cacheReadTokens: 5,
			cacheWriteTokens: 6,
			costUsd: 0.25,
			inputTokens: 3,
			outputTokens: 4,
		},
	],
	"stage-judge": [
		{
			cacheReadTokens: 7,
			cacheWriteTokens: 8,
			costUsd: 0.5,
			inputTokens: 5,
			outputTokens: 6,
		},
		{
			cacheReadTokens: 12,
			cacheWriteTokens: 13,
			costUsd: 1,
			inputTokens: 10,
			outputTokens: 11,
		},
	],
	worker: [
		{
			cacheReadTokens: 12,
			cacheWriteTokens: 13,
			costUsd: 1,
			inputTokens: 10,
			outputTokens: 11,
		},
		{
			cacheReadTokens: 22,
			cacheWriteTokens: 23,
			costUsd: 2,
			inputTokens: 20,
			outputTokens: 21,
		},
	],
};
type ExpectedMetricObservation = Readonly<
	Pick<ClaudeCallMetrics, keyof MetricDistributions>
>;
function expectedDistributions(
	observations: readonly ExpectedMetricObservation[],
): MetricDistributions {
	return {
		cacheReadTokens: observations.map(({ cacheReadTokens }) => cacheReadTokens),
		cacheWriteTokens: observations.map(
			({ cacheWriteTokens }) => cacheWriteTokens,
		),
		costUsd: observations.map(({ costUsd }) => costUsd),
		inputTokens: observations.map(({ inputTokens }) => inputTokens),
		outputTokens: observations.map(({ outputTokens }) => outputTokens),
	};
}
const expectedPerRole = {
	"final-judge": expectedDistributions(expectedRoleObservations["final-judge"]),
	"product-owner": expectedDistributions(
		expectedRoleObservations["product-owner"],
	),
	"stage-judge": expectedDistributions(expectedRoleObservations["stage-judge"]),
	worker: expectedDistributions(expectedRoleObservations.worker),
};
const expectedCompleteRepResources = [
	{ costUsd: 1.75, elapsedMs: 40, workerTurns: 2 },
	{ costUsd: 4.5, elapsedMs: 50, workerTurns: 4 },
];
const expectedFirstPlanningDurationMs = 10;
const expectedLastPlanningDurationMs = 12;
const expectedBuildDurationMs = 20;
const expectedCompleteReps = 2;
const expectedMissingMetricReps = 1;
const expectedMakespanMs = 75;
const buildResourceReportDistributesCompleteRoleEvidenceWithoutZerofillingMissingReps =
	(): void => {
		const report = buildResourceReport(
			["shape", "build"],
			[
				new ConfirmationResourceRepBuilder().build(),
				new ConfirmationResourceRepBuilder().planningOnlyRep().build(),
				new ConfirmationResourceRepBuilder().missingWorkerMetricsRep().build(),
			],
			CONFIRMATION_MAKESPAN_MS,
		);

		expect(report.completeReps).toBe(expectedCompleteReps);
		expect(report.missingMetricReps).toBe(expectedMissingMetricReps);
		expect(report.perRole).toEqual(expectedPerRole);
		expect(report.total.costUsd).toEqual(
			expectedCompleteRepResources.map(({ costUsd }) => costUsd),
		);
		expect(report.workerTurns).toEqual(
			expectedCompleteRepResources.map(({ workerTurns }) => workerTurns),
		);
		expect(report.stageElapsedMs).toEqual(
			Object.fromEntries([
				[
					"shape",
					[expectedFirstPlanningDurationMs, expectedLastPlanningDurationMs],
				],
				["build", [expectedBuildDurationMs]],
			]),
		);
		expect(report.repElapsedMs).toEqual(
			expectedCompleteRepResources.map(({ elapsedMs }) => elapsedMs),
		);
		expect(report.makespanMs).toBe(expectedMakespanMs);
	};
describe(buildResourceReport.name, () => {
	it(
		"distributes complete role evidence without zero-filling missing reps",
		buildResourceReportDistributesCompleteRoleEvidenceWithoutZerofillingMissingReps,
	);
});
