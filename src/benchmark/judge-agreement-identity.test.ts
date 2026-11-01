import { describe, expect, it } from "bun:test";

import {
	buildJudgeAgreementReport,
	judgeAgreementReportSchema,
} from "./judge-agreement";
import type { JudgeAgreementObservation } from "./judge-agreement";

const NO_SKIPPED_CALIBRATIONS = 0;
const FIRST_RESULT_INDEX = 0;
const SINGLE_BASELINE = 1;
const SINGLE_OBSERVATION = 1;

const DIGEST_WIDTH = 64;
const FIRST_CONTRACT = "a".repeat(DIGEST_WIDTH);
const SECOND_CONTRACT = "b".repeat(DIGEST_WIDTH);

function observation(judgeContractSha256?: string): JudgeAgreementObservation {
	return {
		humanDecision: "PASS",
		judgeContractSha256,
		judgeDecision: "PASS",
		judgeModel: "sonnet",
		rubricId: "goal",
		rubricSha256: "c".repeat(DIGEST_WIDTH),
		stage: "shape",
	};
}

function separatesContracts(): void {
	const report = buildJudgeAgreementReport(
		[
			observation(FIRST_CONTRACT),
			observation(SECOND_CONTRACT),
			observation(FIRST_CONTRACT),
		],
		NO_SKIPPED_CALIBRATIONS,
	);

	expect(
		report.baselines.map(({ judgeContractSha256, criteria }) => ({
			judgeContractSha256,
			sampleSize: criteria[FIRST_RESULT_INDEX]?.sampleSize,
		})),
	).toEqual([
		{ judgeContractSha256: FIRST_CONTRACT, sampleSize: 2 },
		{ judgeContractSha256: SECOND_CONTRACT, sampleSize: 1 },
	]);
}

function countsUnknownObservations(): void {
	const report = buildJudgeAgreementReport(
		[observation(), observation(), observation(FIRST_CONTRACT)],
		NO_SKIPPED_CALIBRATIONS,
	);

	expect(report).toMatchObject({ skippedUnknownJudgeObservations: 2 });
	expect(report.baselines).toHaveLength(SINGLE_BASELINE);
	expect(
		report.baselines[FIRST_RESULT_INDEX]?.criteria[FIRST_RESULT_INDEX]
			?.sampleSize,
	).toBe(SINGLE_OBSERVATION);
}

function readsHistoricalReports(): void {
	const { skippedUnknownJudgeObservations: _unknownCount, ...current } =
		buildJudgeAgreementReport(
			[observation(FIRST_CONTRACT)],
			NO_SKIPPED_CALIBRATIONS,
		);
	const historical = {
		...current,
		baselines: current.baselines.map(
			({ criteria, judgeModel, rubricSha256, stage }) => ({
				criteria: [...criteria],
				judgeModel,
				rubricSha256,
				stage,
			}),
		),
	};

	const parsed = judgeAgreementReportSchema.parse(historical);

	expect(parsed).toEqual(historical);
	expect(parsed.baselines[FIRST_RESULT_INDEX]).not.toHaveProperty(
		"judgeContractSha256",
	);
}

describe("Judge instruction identity in agreement", () => {
	it(
		"separates contracts while pooling repeated observations of the same contract",
		separatesContracts,
	);
	it(
		"counts unknown observations without pooling them",
		countsUnknownObservations,
	);
	it(
		"reads a saved historical report without attributing the current contract",
		readsHistoricalReports,
	);
});
