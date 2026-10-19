import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";

import type {
	ComparisonContrast,
	PairedEstimate,
} from "./comparison-estimator";
import ResourceProjections from "./comparison-resource-test-fixtures";
import buildComparisonResources from "./comparison-resources";

const CONTRASTS = [
	{ caseOneDelta: 2.5, caseTwoDelta: 5, name: "candidateMinusBaseline" },
	{ caseOneDelta: 5, caseTwoDelta: 7.5, name: "candidateMinusControl" },
	{ caseOneDelta: 2.5, caseTwoDelta: 2.5, name: "baselineMinusControl" },
] as const;
const METRICS = [
	{ coefficient: 1, metric: "costUsd" },
	{ coefficient: 10, metric: "inputTokens" },
	{ coefficient: 2, metric: "outputTokens" },
	{ coefficient: 3, metric: "cacheReadTokens" },
	{ coefficient: 4, metric: "cacheWriteTokens" },
] as const;
const PAIRED_CASE_COUNT = 2;
interface ExpectedDeltas {
	readonly caseOneDelta: number;
	readonly caseTwoDelta: number;
}

function expectedEstimate({
	caseOneDelta,
	caseTwoDelta,
}: ExpectedDeltas): PairedEstimate {
	return {
		caseDeltas: [
			{ caseId: "case-1", value: caseOneDelta },
			{ caseId: "case-2", value: caseTwoDelta },
		],
		meanDelta: (caseOneDelta + caseTwoDelta) / PAIRED_CASE_COUNT,
		standardError: Math.abs(caseOneDelta - caseTwoDelta) / PAIRED_CASE_COUNT,
	};
}

interface UnusedRoleMetric {
	readonly role: "product-owner" | "stage-judge" | "final-judge";
	readonly metric: "costUsd" | "inputTokens" | "cacheWriteTokens";
}

interface ContrastExample extends ExpectedDeltas {
	readonly name: ComparisonContrast;
}

interface MetricContrastExample extends ContrastExample {
	readonly coefficient: number;
	readonly metric: (typeof METRICS)[number]["metric"];
}

function reportsUnusedRoleMetric({ role, metric }: UnusedRoleMetric): void {
	const request = ResourceProjections.complete();

	const report = buildComparisonResources(request);
	const [firstCase] = report.cases;
	const candidate = firstCase?.arms.candidate;

	assert.ok(
		candidate?.status === "AVAILABLE",
		"candidate resources should be available",
	);
	const unusedRoleValue = 0;
	expect(candidate.perRole[role][metric]).toEqual({
		mean: 0,
		values: [
			unusedRoleValue,
			unusedRoleValue,
			unusedRoleValue,
			unusedRoleValue,
		],
	});
}

function reportsMetricContrast({
	name,
	metric,
	coefficient,
	caseOneDelta,
	caseTwoDelta,
}: MetricContrastExample): void {
	const request = ResourceProjections.complete();

	const report = buildComparisonResources(request);
	const { resources } = report.contrasts[name];

	assert.ok(
		resources.status === "AVAILABLE",
		`${name} resources should be available`,
	);
	expect(resources.total[metric]).toEqual(
		expectedEstimate({
			caseOneDelta: caseOneDelta * coefficient,
			caseTwoDelta: caseTwoDelta * coefficient,
		}),
	);
	expect(resources.perRole.worker[metric]).toEqual(resources.total[metric]);
}

function reportsWorkerTurnContrast({
	name,
	caseOneDelta,
	caseTwoDelta,
}: ContrastExample): void {
	const request = ResourceProjections.complete();

	const report = buildComparisonResources(request);
	const { resources } = report.contrasts[name];

	assert.ok(
		resources.status === "AVAILABLE",
		`${name} resources should be available`,
	);
	expect(resources.workerTurns).toEqual(
		expectedEstimate({ caseOneDelta, caseTwoDelta }),
	);
}

function reportsWorkerResourcesAsTheCompleteTotal(): void {
	const request = ResourceProjections.complete();

	const report = buildComparisonResources(request);
	const [firstCase] = report.cases;
	const candidate = firstCase?.arms.candidate;

	assert.ok(
		candidate?.status === "AVAILABLE",
		"candidate resources should be available",
	);
	expect(candidate.perRole.worker).toEqual(candidate.total);
}
describe(buildComparisonResources.name, () => {
	describe("when every rep records all metrics", () => {
		it(
			"reports worker resources as the complete total",
			reportsWorkerResourcesAsTheCompleteTotal,
		);
		it.each([
			{ metric: "costUsd", role: "product-owner" },
			{ metric: "inputTokens", role: "stage-judge" },
			{ metric: "cacheWriteTokens", role: "final-judge" },
		] as const)(
			"reports zero $metric observations for the unused $role",
			reportsUnusedRoleMetric,
		);
		it.each(
			CONTRASTS.flatMap(({ caseOneDelta, caseTwoDelta, name }) =>
				METRICS.map(({ coefficient, metric }) => ({
					caseOneDelta,
					caseTwoDelta,
					coefficient,
					metric,
					name,
				})),
			),
		)("reports exact $metric estimates for $name", reportsMetricContrast);
		it.each([...CONTRASTS])(
			"reports exact worker-turn estimates for $name",
			reportsWorkerTurnContrast,
		);
	});
});
