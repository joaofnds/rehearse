import { describe, expect, it } from "bun:test";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { PairedEstimate } from "./comparison-estimator";
import { buildComparisonResources } from "./comparison-resources";
import {
	comparisonRep,
	comparisonReps,
	FAIL,
	PASS,
	withMissingMetrics,
} from "./comparison-test-fixtures";

describe(buildComparisonResources.name, () => {
	it("reports per-role observations and exact estimates for every resource contrast", () => {
		const report = buildComparisonResources({
			contract: {
				mode: "pipeline",
				declaredStages: ["discuss", "build"],
				reps: 4,
			},
			cases: [
				{
					caseId: "case-1",
					arms: {
						baseline: comparisonReps(
							"case-1",
							"baseline",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 1 },
						),
						candidate: comparisonReps(
							"case-1",
							"candidate",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 2 },
						),
						control: comparisonReps(
							"case-1",
							"control",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 0 },
						),
					},
				},
				{
					caseId: "case-2",
					arms: {
						baseline: comparisonReps(
							"case-2",
							"baseline",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 1 },
						),
						candidate: comparisonReps(
							"case-2",
							"candidate",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 3 },
						),
						control: comparisonReps(
							"case-2",
							"control",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 0 },
						),
					},
				},
			],
		});
		const candidate = report.cases[0]?.arms.candidate;
		if (candidate?.status !== "AVAILABLE") {
			throw new Error("candidate resources should be available");
		}

		expect(candidate.perRole.worker).toEqual(candidate.total);
		expect(candidate.perRole["product-owner"].costUsd).toEqual({
			values: [0, 0, 0, 0],
			mean: 0,
		});
		expect(candidate.perRole["stage-judge"].inputTokens).toEqual({
			values: [0, 0, 0, 0],
			mean: 0,
		});
		expect(candidate.perRole["final-judge"].cacheWriteTokens).toEqual({
			values: [0, 0, 0, 0],
			mean: 0,
		});

		const expectedEstimate = (
			first: number,
			second: number,
		): PairedEstimate => ({
			caseDeltas: [
				{ caseId: "case-1", value: first },
				{ caseId: "case-2", value: second },
			],
			meanDelta: (first + second) / 2,
			standardError: Math.abs(first - second) / 2,
		});
		const contrasts = [
			["candidateMinusBaseline", [2.5, 5]],
			["candidateMinusControl", [5, 7.5]],
			["baselineMinusControl", [2.5, 2.5]],
		] as const;
		const coefficients = [
			["costUsd", 1],
			["inputTokens", 10],
			["outputTokens", 2],
			["cacheReadTokens", 3],
			["cacheWriteTokens", 4],
		] as const;
		for (const [name, [first, second]] of contrasts) {
			const { resources } = report.contrasts[name];
			if (resources.status !== "AVAILABLE") {
				throw new Error(`${name} resources should be available`);
			}
			for (const [metric, coefficient] of coefficients) {
				expect(resources.total[metric]).toEqual(
					expectedEstimate(first * coefficient, second * coefficient),
				);
				expect(resources.perRole.worker[metric]).toEqual(
					resources.total[metric],
				);
			}
			expect(resources.workerTurns).toEqual(expectedEstimate(first, second));
		}
	});

	it("reports complete resource means and unavailable missing-metric contrasts", () => {
		const caseOneControl = [
			comparisonRep("case-1-control", 1, FAIL, { metricScale: 0 }),
			withMissingMetrics(
				comparisonRep("case-1-control", 2, FAIL, { metricScale: 0 }),
				"stage-judge call metrics",
			),
			comparisonRep("case-1-control", 3, FAIL, { metricScale: 0 }),
			comparisonRep("case-1-control", 4, FAIL, { metricScale: 0 }),
		];
		const report = buildComparisonResources({
			contract: {
				mode: "pipeline",
				declaredStages: ["discuss", "build"],
				reps: 4,
			},
			cases: [
				{
					caseId: "case-1",
					arms: {
						baseline: comparisonReps(
							"case-1",
							"baseline",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 1 },
						),
						candidate: comparisonReps(
							"case-1",
							"candidate",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 2 },
						),
						control: caseOneControl,
					},
				},
				{
					caseId: "case-2",
					arms: {
						baseline: comparisonReps(
							"case-2",
							"baseline",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 1 },
						),
						candidate: comparisonReps(
							"case-2",
							"candidate",
							[PASS, PASS, PASS, PASS],
							{ metricScale: 3 },
						),
						control: comparisonReps(
							"case-2",
							"control",
							[FAIL, FAIL, FAIL, FAIL],
							{ metricScale: 0 },
						),
					},
				},
			],
		});

		expect(report.cases[0]?.arms.candidate).toMatchObject({
			status: "AVAILABLE",
			completeReps: 4,
			missingMetricReps: 0,
			total: {
				costUsd: { values: [2, 4, 6, 8], mean: 5 },
				inputTokens: { values: [20, 40, 60, 80], mean: 50 },
				outputTokens: { values: [4, 8, 12, 16], mean: 10 },
				cacheReadTokens: { values: [6, 12, 18, 24], mean: 15 },
				cacheWriteTokens: { values: [8, 16, 24, 32], mean: 20 },
			},
			workerTurns: { values: [2, 4, 6, 8], mean: 5 },
		});
		expect(report.cases[0]?.arms.control).toEqual({
			status: "UNAVAILABLE",
			completeReps: 3,
			missingMetricReps: 1,
			missingEvidence: [
				{
					repId: "case-1-control-rep-2",
					ordinal: 2,
					missing: ["stage-judge call metrics"],
				},
			],
		});
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
		expect(report.contrasts.candidateMinusControl.resources).toEqual({
			status: "UNAVAILABLE",
			missingEvidence: [
				{
					caseId: "case-1",
					arm: "control",
					repId: "case-1-control-rep-2",
					ordinal: 2,
					missing: ["stage-judge call metrics"],
				},
			],
		});
		expect(report.contrasts.baselineMinusControl.resources.status).toBe(
			"UNAVAILABLE",
		);
	});

	it("summarises each arm's per-attempt elapsed time from its reps", () => {
		const arm = (
			role: "baseline" | "candidate" | "control",
			elapsedMs: readonly number[],
		): readonly ConfirmationRepRecord[] =>
			elapsedMs.map((elapsed, index) =>
				comparisonRep(`case-1-${role}`, index + 1, PASS, {
					elapsedMs: elapsed,
				}),
			);
		const report = buildComparisonResources({
			contract: {
				mode: "pipeline",
				declaredStages: ["discuss", "build"],
				reps: 2,
			},
			cases: [
				{
					caseId: "case-1",
					arms: {
						baseline: arm("baseline", [1000, 3000]),
						candidate: arm("candidate", [2000, 6000]),
						control: arm("control", [500, 1500]),
					},
				},
			],
		});
		const baseline = report.cases[0]?.arms.baseline;
		if (baseline?.status !== "AVAILABLE") {
			throw new Error("baseline resources should be available");
		}

		expect(baseline.elapsedMs).toEqual({ values: [1000, 3000], mean: 2000 });
	});
});
