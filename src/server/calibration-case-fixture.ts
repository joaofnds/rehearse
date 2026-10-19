import { mkdir } from "node:fs/promises";

import type { StageLetterGrade } from "#benchmark/contracts";
import type { JsonValue } from "#benchmark/json-value";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import { INPUT, JUDGE_SUMMARY } from "#server/calibration-case-test-data";
import JudgedGradeBuilder from "#server/calibration-judged-grade-test-builder";
import CalibrationScorecardBuilder from "#server/calibration-scorecard-test-builder";
import StageGradeBuilder from "#server/calibration-stage-grade-test-builder";

const FIRST_REVIEW_DIMENSION_INDEX = 0;

const SECOND_REVIEW_DIMENSION_INDEX = 1;

interface JudgedStage {
	readonly run: string;
	readonly stage?: string;
	readonly judgeModel?: string;
	readonly dimensions: readonly [StageLetterGrade, StageLetterGrade];
	readonly input?: Readonly<Record<string, JsonValue>>;
}

/** A pipeline stage's scorecard as the harness writes it once its Judge graded every criterion PASS. */
async function writeJudgedStage(
	runsDirectory: string,
	judged: JudgedStage,
): Promise<void> {
	const stage = judged.stage ?? "shape";
	const paths = benchmarkRunPaths(runsDirectory, judged.run);
	const grade = new StageGradeBuilder({
		dimensions: [
			{
				evidence: [],
				grade: judged.dimensions[FIRST_REVIEW_DIMENSION_INDEX],
				id: "clarity",
			},
			{
				evidence: [],
				grade: judged.dimensions[SECOND_REVIEW_DIMENSION_INDEX],
				id: "decision-quality",
			},
		],
	}).build();

	await mkdir(paths.checkpointsDirectory, { recursive: true });

	await Bun.write(
		paths.stageFile(stage),
		JSON.stringify({
			judgeModel: judged.judgeModel ?? "opus",
			stage,
			...new CalibrationScorecardBuilder({
				grade,
				input: { ...INPUT, stage },
			}).build(),
			input: judged.input ?? { ...INPUT, stage },
		}),
	);
}

const FIRST_RUN = "2026-10-01T10-00-00.000Z";

const SECOND_RUN = "2026-10-02T10-00-00.000Z";

async function writeRepStage(
	runsDirectory: string,
	groupId: string,
): Promise<void> {
	const group = confirmationGroupPaths(runsDirectory, groupId);
	const grade = new StageGradeBuilder({
		dimensions: [
			{ evidence: [], grade: "C", id: "clarity" },
			{ evidence: [], grade: "C", id: "decision-quality" },
		],
	}).build();

	await Bun.write(
		group.groupFile,
		JSON.stringify({ inputs: { judgeModel: "sonnet" } }),
	);

	await Bun.write(
		group.rep("rep-1").stageFile("shape"),
		JSON.stringify({
			stage: "shape",
			...new CalibrationScorecardBuilder({
				grade,
				input: { ...INPUT, stage: "shape" },
			}).build(),
		}),
	);
}

async function writeReplayStage(runsDirectory: string): Promise<void> {
	const grade = new StageGradeBuilder({
		dimensions: [
			{ evidence: [], grade: "B", id: "clarity" },
			{ evidence: [], grade: "C", id: "decision-quality" },
		],
	}).build();

	await Bun.write(
		replayRecordFile(runsDirectory, "lineage-1", "2026-09-30T10:00:00.000Z"),
		JSON.stringify({
			judgeModel: "haiku",
			scorecard: new CalibrationScorecardBuilder({
				grade,
				input: { ...INPUT, stage: "decompose" },
			}).build(),
			stage: "decompose",
		}),
	);
}

async function writeStoppedStage(
	runsDirectory: string,
	run: string,
): Promise<void> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	await mkdir(paths.checkpointsDirectory, { recursive: true });
	await Bun.write(
		paths.stageFile("shape"),
		JSON.stringify({
			input: INPUT,
			judgeModel: "opus",
			stage: "shape",
			status: "STAGE_JUDGE_FAILED",
			...new JudgedGradeBuilder({
				dimensions: [
					{ evidence: [], grade: "F", id: "clarity" },
					{ evidence: [], grade: "B", id: "decision-quality" },
				],
			}).build(),
			grade: { grade: "F", verdict: "STOP" },
			summary: JUDGE_SUMMARY,
		}),
	);
	await Bun.write(paths.stageFile("decompose"), "not json");
}

export {
	writeJudgedStage,
	writeRepStage,
	writeReplayStage,
	writeStoppedStage,
	FIRST_RUN,
	SECOND_RUN,
};

export {
	RUBRIC,
	INPUT,
	JUDGE_SUMMARY,
	JUDGE_CLAIM,
} from "#server/calibration-case-test-data";
