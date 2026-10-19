import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { JudgeAgreementCalibration } from "./judge-agreement";
import {
	finalEvidence,
	stageEvidence,
} from "./judge-agreement-calibration-test-fixtures";

const stageArtifact = {
	calibration: {
		humanReview: {
			findings: [],
			summary: "agrees with both decisions",
			verdict: "ACCEPT",
		},
	},
	grade: {
		dimensions: [{ evidence: stageEvidence, grade: "A", id: "clarity" }],
		grade: "A",
		hardBlockers: [],
		requirements: [{ evidence: stageEvidence, id: "goal", status: "PASS" }],
		summary: "clear goal",
		verdict: "CONTINUE",
	},
	rubric: {
		dimensions: [
			{
				description: "write clearly",
				excellent: "precise",
				good: "clear",
				id: "clarity",
			},
		],
		hardBlockers: [],
		requirements: [{ description: "state the goal", id: "goal" }],
	},
	stage: "shape",
};
async function historicalCalibrationFiles(
	runsDirectory: string,
): Promise<void> {
	await Bun.write(
		join(runsDirectory, "future.shape.json"),
		JSON.stringify({ ...stageArtifact, judgeModel: "opus" }),
	);
	await mkdir(join(runsDirectory, "historical.checkpoints"));
	await Bun.write(
		join(runsDirectory, "historical.checkpoints", "manifest.json"),
		JSON.stringify({ judgeModel: "opus" }),
	);
	await Bun.write(
		join(runsDirectory, "historical.shape.json"),
		JSON.stringify(stageArtifact),
	);
	const { calibration: _calibration, ...priorStageArtifact } = stageArtifact;
	await Bun.write(
		join(runsDirectory, "historical.discuss.json"),
		JSON.stringify({ ...priorStageArtifact, stage: "discuss" }),
	);
	await Bun.write(
		join(runsDirectory, "pre-manifest.shape.json"),
		JSON.stringify(stageArtifact),
	);
}
const HISTORICAL_AGREEMENT_REPORT = {
	baselines: [
		{
			criteria: [
				{
					judgePassHumanPass: 1,
					rubricId: "clarity",
					sampleSize: 1,
				},
				{
					judgePassHumanPass: 1,
					rubricId: "goal",
					sampleSize: 1,
				},
			],
			judgeModel: "opus",
			stage: "discuss",
		},
		{
			criteria: [
				{
					judgePassHumanPass: 2,
					rubricId: "clarity",
					sampleSize: 2,
				},
				{
					judgePassHumanPass: 2,
					rubricId: "goal",
					sampleSize: 2,
				},
			],
			judgeModel: "opus",
			stage: "shape",
		},
	],
	skippedCalibrations: 1,
};
const CURRENT_CALIBRATIONS = [
	{
		final: {
			grade: {
				requirements: [
					{ evidence: finalEvidence, id: "criterion", status: "PASS" },
				],
				summary: "passed criterion",
				verdict: "PASS",
			},
			rubric: "1. `criterion`: contract\n",
		},
		humanReview: {
			findings: [],
			summary: "agrees with the decision",
			verdict: "ACCEPT",
		},
		judgeModel: "opus",
		stages: [],
	},
] satisfies readonly JudgeAgreementCalibration[];
const CURRENT_BASELINES = [
	{
		criteria: [
			{
				judgePassHumanPass: 1,
				rubricId: "criterion",
				sampleSize: 1,
			},
		],
		judgeModel: "opus",
		stage: "final",
	},
];
export {
	historicalCalibrationFiles,
	HISTORICAL_AGREEMENT_REPORT,
	CURRENT_CALIBRATIONS,
	CURRENT_BASELINES,
};
