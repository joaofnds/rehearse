import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import StageJudgeEventBuilder from "#server/stage-judge-event-test-builder";
import {
	JUDGED_ANSWER,
	JUDGED_ITEMS,
	RUN,
	clearJudgeRoots,
	queuedRun,
	recordEvents,
	startStageJudgeApi,
} from "#server/stage-judge-test-fixture";

import readStageJudge from "./stage-judge";

afterEach(clearJudgeRoots);

describe(readStageJudge.name, () => {
	it(
		"answers a stage whose judge has not started as waiting",
		verifyWaitingJudge,
	);

	it(
		"answers each judged blocker and dimension with its result and evidence once the record holds the grade",
		verifyGradedItems,
	);
});

describe(readStageJudge.name, () => {
	describe("when the record or the stream is older or partial", () => {
		it(
			"answers the judged items the record of the stage that stopped the run keeps",
			verifyStoppedStageGrade,
		);

		it(
			"answers a stop record the judge never graded as not judged",
			verifyUngradedStop,
		);
	});
});

describe("/api/runs/:run/stages/:stage/judge", () => {
	it(
		"answers with the stage's judge as the reader shows it",
		verifyJudgeApiReading,
	);

	it(
		"answers 404 for a stage the run's pipeline does not have",
		verifyInvalidStageResponse,
	);
});

async function verifyWaitingJudge(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({
			kind: "stage-started",
			runSpentUsd: 1,
		}).build(),
	]);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({ state: "waiting" });
}

async function verifyGradedItems(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({ kind: "stage-judging" }).build(),
	]);
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
		JSON.stringify({ grade: JUDGED_ITEMS, stage: "build" }),
	);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual(JUDGED_ANSWER);
}

async function verifyStoppedStageGrade(): Promise<void> {
	const runsDirectory = await queuedRun();
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
		JSON.stringify({
			error: "Stage build graded D below the minimum C",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
			...JUDGED_ITEMS,
			grade: { grade: "D", verdict: "CONTINUE" },
		}),
	);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual(JUDGED_ANSWER);
}

async function verifyUngradedStop(): Promise<void> {
	const runsDirectory = await queuedRun();
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RUN).stageFile("build"),
		JSON.stringify({
			error: "The ceiling refused the stage",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const judge = await readStageJudge({
		run: RUN,
		runsDirectory,
		stage: "build",
	});

	expect(judge).toEqual({ state: "not-judged" });
}

async function verifyJudgeApiReading(): Promise<void> {
	const runsDirectory = await queuedRun();
	await recordEvents(runsDirectory, [
		new StageJudgeEventBuilder({ kind: "stage-started" }).build(),
	]);
	const api = await startStageJudgeApi(runsDirectory);

	const response = await api.savedEvidence.stageJudge({
		run: RUN,
		stage: "build",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({ state: "waiting" });
}

async function verifyInvalidStageResponse(): Promise<void> {
	const runsDirectory = await queuedRun();
	const api = await startStageJudgeApi(runsDirectory);

	const response = await api.savedEvidence.stageJudge({
		run: RUN,
		stage: "deploy",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
