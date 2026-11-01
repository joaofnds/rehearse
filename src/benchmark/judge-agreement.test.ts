import { describe, expect, it } from "bun:test";

import { stageRubricSchema } from "./contracts";
import {
	buildJudgeAgreementReport,
	stageRubricSha256,
} from "./judge-agreement";
import type { JudgeAgreementObservation } from "./judge-agreement";
import {
	FIRST_CALIBRATION_CRITERION_INDEX,
	IDENTITY_BASELINES,
	IDENTITY_OBSERVATIONS,
	NO_SKIPPED_CALIBRATIONS,
	RAW_AGREEMENT_REPORT,
	SHA256_HEX_DIGITS,
	rawAgreementObservations,
} from "./judge-agreement-count-test-fixtures";

function keepsTheRecordedDigestAfterParsingARubric(): void {
	const rubric = stageRubricSchema.parse({
		dimensions: [
			{
				description: "Dimension",
				excellent: "Excellent",
				good: "Good",
				id: "dimension",
			},
		],
		hardBlockers: [{ description: "Blocker", id: "blocker" }],
		requirements: [{ description: "Required", id: "required" }],
	});

	expect(stageRubricSha256(rubric)).toBe(
		"899ca9b4267506285e633b7843dd53986208ef9dde764a909e25a01c7ed84928",
	);
}

function reportsRawAgreementCountsAndCohenSKappa(): void {
	const observations = rawAgreementObservations();

	const report = buildJudgeAgreementReport(
		observations,
		NO_SKIPPED_CALIBRATIONS,
	);

	expect(report).toEqual(RAW_AGREEMENT_REPORT);
}

function reportsNullKappaWhenExpectedAgreementIsOne(): void {
	const observations: readonly JudgeAgreementObservation[] = [
		{
			humanDecision: "PASS",
			judgeContractSha256: "d".repeat(SHA256_HEX_DIGITS),
			judgeDecision: "PASS",
			judgeModel: "opus",
			rubricId: "correctness",
			rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
			stage: "final",
		},
	];

	const report = buildJudgeAgreementReport(
		observations,
		NO_SKIPPED_CALIBRATIONS,
	);

	const [observedFirstBaseline] = report.baselines;

	expect(
		observedFirstBaseline?.criteria[FIRST_CALIBRATION_CRITERION_INDEX],
	).toMatchObject({
		cohensKappa: null,
		observedAgreement: 1,
		sampleSize: 1,
	});
}

function keepsModelRubricStageAndCriterionIdentitiesSeparate(): void {
	const observations = IDENTITY_OBSERVATIONS;

	const report = buildJudgeAgreementReport(
		observations,
		NO_SKIPPED_CALIBRATIONS,
	);

	expect(
		report.baselines.map((baseline) => ({
			judgeModel: baseline.judgeModel,
			rubricIds: baseline.criteria.map(({ rubricId }) => rubricId),
			rubricSha256: baseline.rubricSha256,
			stage: baseline.stage,
		})),
	).toEqual(IDENTITY_BASELINES);
}

describe(stageRubricSha256.name, () => {
	it(
		"keeps the recorded digest after parsing a rubric",
		keepsTheRecordedDigestAfterParsingARubric,
	);
});

describe(buildJudgeAgreementReport.name, () => {
	it(
		"reports raw agreement counts and Cohen's kappa",
		reportsRawAgreementCountsAndCohenSKappa,
	);

	it(
		"reports null kappa when expected agreement is one",
		reportsNullKappaWhenExpectedAgreementIsOne,
	);

	it(
		"keeps model, rubric, stage, and criterion identities separate",
		keepsModelRubricStageAndCriterionIdentitiesSeparate,
	);
});
