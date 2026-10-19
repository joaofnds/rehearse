import { describe, expect, it } from "bun:test";

import {
	parseComparisonReport,
	serializeComparisonReport,
} from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import type { PipelineFinalExample } from "./comparison-report-integrity-test-examples";
import {
	FIRST_COMPARISON_CASE_INDEX,
	FIRST_CONFIRMATION_REP_INDEX,
	FIRST_QUALITY_SUMMARY_INDEX,
	FIRST_REPORTED_CASE_INDEX,
	FIRST_REP_OUTCOME_INDEX,
	FIRST_SOURCE_REP_INDEX,
	FOURTH_CONFIRMATION_REP_INDEX,
	PIPELINE_FINAL_EXAMPLES,
	SECOND_CONFIRMATION_REP_INDEX,
	SHA256_HEX_CHARACTERS,
	THIRD_CONFIRMATION_REP_INDEX,
	THIRD_REP_OUTCOME_INDEX,
} from "./comparison-report-integrity-test-examples";
import {
	EXPECTED_BASELINE_REPETITION_OUTCOMES,
	EXPECTED_CANDIDATE_REPETITION_OUTCOMES,
	EXPECTED_EXECUTION_GAP_OUTCOMES,
	EXPECTED_MATCHED_GRADE_DISTRIBUTION,
	incompleteOutcomeEvidenceFixture,
	matchedDistributionEvidenceFixture,
	pipelineFinalEvidenceFixture,
} from "./comparison-report-result-test-fixtures";
import {
	EXPECTED_FIRST_CANDIDATE_REP,
	RECORDED_JUDGE_AGREEMENT,
	comparisonEvidenceFixture,
} from "./comparison-report-test-fixtures";

describe(buildComparisonReport.name, () => {
	it(
		"keeps each repetition's outcomes when aggregate distributions match",
		keepsEachRepetitionSOutcomesWhenAggregateDistributionsMatch,
	);

	it(
		"records strict versioned results and all frozen source provenance",
		recordsStrictVersionedResultsAndAllFrozenSourceProvenance,
	);

	it(
		"records the declared mode, measures and judge agreement",
		recordsTheComparisonDeclarationAndJudgeAgreement,
	);

	it(
		"records every frozen arm source and contrast role",
		recordsEveryArmSourceAndContrastRole,
	);

	it(
		"preserves non-judged outcomes and metrics-aware judged success",
		preservesNonJudgedOutcomesAndMetricsAwareJudgedSuccess,
	);

	it.each([...PIPELINE_FINAL_EXAMPLES])(
		"preserves a pipeline-final $final outcome",
		preservesPipelineFinalOutcome,
	);
});

function keepsEachRepetitionSOutcomesWhenAggregateDistributionsMatch(): void {
	const expectedSchemaVersion = 6;

	const evidence = matchedDistributionEvidenceFixture();

	const report = buildComparisonReport(evidence, {
		baselines: [],
		skippedCalibrations: 0,
	});
	const [benchmarkCase] = report.cases;

	expect(report.schemaVersion).toBe(expectedSchemaVersion);
	expect(
		benchmarkCase?.arms.baseline.quality[FIRST_QUALITY_SUMMARY_INDEX]
			?.gradeDistribution,
	).toEqual(EXPECTED_MATCHED_GRADE_DISTRIBUTION);
	expect(
		benchmarkCase?.arms.candidate.quality[FIRST_QUALITY_SUMMARY_INDEX]
			?.gradeDistribution,
	).toEqual(EXPECTED_MATCHED_GRADE_DISTRIBUTION);
	expect(
		benchmarkCase?.arms.baseline.source.reps.map(({ ordinal, outcomes }) => ({
			ordinal,
			outcome: outcomes[FIRST_REP_OUTCOME_INDEX],
		})),
	).toEqual(EXPECTED_BASELINE_REPETITION_OUTCOMES);
	expect(
		benchmarkCase?.arms.candidate.source.reps.map(({ ordinal, outcomes }) => ({
			ordinal,
			outcome: outcomes[FIRST_REP_OUTCOME_INDEX],
		})),
	).toEqual(EXPECTED_CANDIDATE_REPETITION_OUTCOMES);
}

function recordsStrictVersionedResultsAndAllFrozenSourceProvenance(): void {
	const expectedSchemaVersion = 6;

	const report = buildComparisonReport(
		comparisonEvidenceFixture(),
		RECORDED_JUDGE_AGREEMENT,
	);

	expect(parseComparisonReport(JSON.stringify(report))).toEqual(report);

	expect(
		new Bun.CryptoHasher("sha256")
			.update(serializeComparisonReport(report))
			.digest("hex"),
	).toBe("b37a647728abe00ebfecbb6951c8f1b06bbb4fd43db7e0cb9c70bfa65b2a8658");

	expect(report.schemaVersion).toBe(expectedSchemaVersion);

	expect(() =>
		parseComparisonReport(
			JSON.stringify({ ...report, unexpected: "not strict" }),
		),
	).toThrow();
}

function recordsTheComparisonDeclarationAndJudgeAgreement(): void {
	const expectedReps = 4;

	const report = buildComparisonReport(
		comparisonEvidenceFixture(),
		RECORDED_JUDGE_AGREEMENT,
	);

	expect(report.judgeAgreement).toEqual(RECORDED_JUDGE_AGREEMENT);

	expect(report.manifest).toEqual({
		sha256: "8".repeat(SHA256_HEX_CHARACTERS),
	});

	expect(report.mode).toBe("pipeline");

	expect(report.declaredStages).toEqual(["discuss", "build"]);

	expect(report.reps).toBe(expectedReps);
}

function recordsEveryArmSourceAndContrastRole(): void {
	const report = buildComparisonReport(
		comparisonEvidenceFixture(),
		RECORDED_JUDGE_AGREEMENT,
	);

	const candidate = report.cases.at(FIRST_COMPARISON_CASE_INDEX)?.arms
		.candidate;

	expect(candidate?.role).toBe("candidate");

	expect(candidate?.source.groups).toEqual([
		{
			path: "groups/case-1-candidate/group.json",
			sha256: "6".repeat(SHA256_HEX_CHARACTERS),
		},
	]);

	expect(candidate?.source.reps.at(FIRST_CONFIRMATION_REP_INDEX)).toEqual(
		EXPECTED_FIRST_CANDIDATE_REP,
	);

	expect(candidate?.executedCorpus).toEqual([
		{
			path: "inputs/corpus/SKILL.md",
			sha256: "2".repeat(SHA256_HEX_CHARACTERS),
		},
	]);

	expect(report.contrasts.candidateMinusBaseline.minuend).toBe("candidate");

	expect(report.contrasts.candidateMinusBaseline.subtrahend).toBe("baseline");
}

function preservesNonJudgedOutcomesAndMetricsAwareJudgedSuccess(): void {
	const evidence = incompleteOutcomeEvidenceFixture();

	const report = buildComparisonReport(evidence, {
		baselines: [],
		skippedCalibrations: 0,
	});
	const [reportedCase] = report.cases;
	const reps = reportedCase?.arms.baseline.source.reps;

	expect(reps?.[SECOND_CONFIRMATION_REP_INDEX]?.outcomes).toEqual(
		EXPECTED_EXECUTION_GAP_OUTCOMES,
	);
	expect(reps?.[THIRD_CONFIRMATION_REP_INDEX]?.outcomes).toEqual([
		{ grade: "A", name: "discuss", status: "JUDGED", successful: true },
		{ name: "build", status: "METRICS_MISSING", successful: false },
		{ name: "final", status: "NOT_REACHED", successful: false },
	]);
	expect(reps?.[FOURTH_CONFIRMATION_REP_INDEX]?.outcomes).toEqual([
		{ grade: "A", name: "discuss", status: "JUDGED", successful: false },
		{ grade: "A", name: "build", status: "JUDGED", successful: false },
		{ grade: "PASS", name: "final", status: "JUDGED", successful: false },
	]);
}

function preservesPipelineFinalOutcome({
	final,
	status,
}: PipelineFinalExample): void {
	const evidence = pipelineFinalEvidenceFixture(final);

	const report = buildComparisonReport(evidence, {
		baselines: [],
		skippedCalibrations: 0,
	});
	const outcome =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.source.reps[
			FIRST_SOURCE_REP_INDEX
		]?.outcomes[THIRD_REP_OUTCOME_INDEX];

	expect(outcome).toEqual({ name: "final", status, successful: false });
	expect(outcome).not.toHaveProperty("grade");
}
