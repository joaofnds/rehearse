import type { JudgeAgreementObservation } from "./judge-agreement";

const EXPECTED_KAPPA_NUMERATOR = 1;
const EXPECTED_KAPPA_DENOMINATOR = 3;
const EXPECTED_OBSERVED_AGREEMENTS = 2;
const EXPECTED_AGREEMENT_OBSERVATIONS = 3;
const NO_SKIPPED_CALIBRATIONS = 0;
const FIRST_CALIBRATION_CRITERION_INDEX = 0;

const SHA256_HEX_DIGITS = 64;

function rawAgreementObservations(): readonly JudgeAgreementObservation[] {
	const baseline = {
		judgeModel: "opus",
		rubricId: "correctness",
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	};
	const observations: readonly JudgeAgreementObservation[] = [
		{ ...baseline, humanDecision: "PASS", judgeDecision: "PASS" },
		{ ...baseline, humanDecision: "PASS", judgeDecision: "PASS" },
		{ ...baseline, humanDecision: "FAIL", judgeDecision: "FAIL" },
		{ ...baseline, humanDecision: "FAIL", judgeDecision: "FAIL" },
		{ ...baseline, humanDecision: "FAIL", judgeDecision: "PASS" },
		{ ...baseline, humanDecision: "PASS", judgeDecision: "FAIL" },
	];

	return observations;
}
const RAW_AGREEMENT_REPORT = {
	baselines: [
		{
			criteria: [
				{
					cohensKappa: EXPECTED_KAPPA_NUMERATOR / EXPECTED_KAPPA_DENOMINATOR,
					judgeFailHumanFail: 2,
					judgeFailHumanPass: 1,
					judgePassHumanFail: 1,
					judgePassHumanPass: 2,
					observedAgreement:
						EXPECTED_OBSERVED_AGREEMENTS / EXPECTED_AGREEMENT_OBSERVATIONS,
					rubricId: "correctness",
					sampleSize: 6,
				},
			],
			judgeModel: "opus",
			rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
			stage: "build",
		},
	],
	skippedCalibrations: 0,
};
const IDENTITY_OBSERVATIONS: readonly JudgeAgreementObservation[] = [
	{
		humanDecision: "PASS",
		judgeDecision: "PASS",
		judgeModel: "sonnet",
		rubricId: "second",
		rubricSha256: "b".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
	{
		humanDecision: "PASS",
		judgeDecision: "PASS",
		judgeModel: "opus",
		rubricId: "second",
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "shape",
	},
	{
		humanDecision: "PASS",
		judgeDecision: "PASS",
		judgeModel: "opus",
		rubricId: "second",
		rubricSha256: "b".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
	{
		humanDecision: "PASS",
		judgeDecision: "PASS",
		judgeModel: "opus",
		rubricId: "second",
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
	{
		humanDecision: "PASS",
		judgeDecision: "PASS",
		judgeModel: "opus",
		rubricId: "first",
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
];
const IDENTITY_BASELINES = [
	{
		judgeModel: "opus",
		rubricIds: ["first", "second"],
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
	{
		judgeModel: "opus",
		rubricIds: ["second"],
		rubricSha256: "b".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
	{
		judgeModel: "opus",
		rubricIds: ["second"],
		rubricSha256: "a".repeat(SHA256_HEX_DIGITS),
		stage: "shape",
	},
	{
		judgeModel: "sonnet",
		rubricIds: ["second"],
		rubricSha256: "b".repeat(SHA256_HEX_DIGITS),
		stage: "build",
	},
];
export {
	SHA256_HEX_DIGITS,
	NO_SKIPPED_CALIBRATIONS,
	FIRST_CALIBRATION_CRITERION_INDEX,
	rawAgreementObservations,
	RAW_AGREEMENT_REPORT,
	IDENTITY_OBSERVATIONS,
	IDENTITY_BASELINES,
};
