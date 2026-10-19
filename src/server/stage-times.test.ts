import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	STAGES,
	clearStageTimeRoots,
	recordRun,
	runsDirectory,
	startEvidenceApi,
} from "#server/stage-times-test-fixture";

import type { StageTime } from "./stage-times";

const RUN = "2026-10-01T10-00-00.000Z";

const FIRST_EARLIER = "2026-09-29T10-00-00.000Z";

const SECOND_EARLIER = "2026-09-30T10-00-00.000Z";

afterEach(clearStageTimeRoots);

function unrecorded(stage: string): StageTime {
	return {
		reasons: [`no prior run of this case recorded a time for ${stage}`],
		stage,
		state: "unavailable",
	};
}

describe("/api/runs/:run/stage-times", () => {
	it(
		"gives each stage of the run the median time earlier runs of its case took in it",
		verifyApiRunsRunStageTimesGivesEachStageOfTheRunTheMedianTimeEarlierRunsOfItsCaseTookInIt,
	);

	it(
		"takes the middle time, not the mean, of an odd count of earlier runs",
		verifyApiRunsRunStageTimesTakesTheMiddleTimeNotTheMeanOfAnOddCountOfEarlierRuns,
	);

	it(
		"leaves out runs of another case and runs started after this one",
		verifyApiRunsRunStageTimesLeavesOutRunsOfAnotherCaseAndRunsStartedAfterThisOne,
	);

	it(
		"leaves out the time of a stage that stopped its run before it finished",
		verifyApiRunsRunStageTimesLeavesOutTheTimeOfAStageThatStoppedItsRunBeforeItFinished,
	);

	it(
		"leaves out an earlier record it cannot read, and counts the rest",
		verifyApiRunsRunStageTimesLeavesOutAnEarlierRecordItCannotReadAndCountsTheRest,
	);

	describe("when no earlier run recorded a stage's time", () => {
		it(
			"says no earlier run of the case exists",
			verifyApiRunsRunStageTimesWhenNoEarlierRunRecordedAStageSTimeSaysNoEarlierRunOfTheCaseExists,
		);

		it(
			"says no earlier run of the case recorded that stage's time",
			verifyApiRunsRunStageTimesWhenNoEarlierRunRecordedAStageSTimeSaysNoEarlierRunOfTheCaseRecordedThatStageSTime,
		);
	});

	it(
		"refuses a run name that leaves the runs directory",
		verifyApiRunsRunStageTimesRefusesARunNameThatLeavesTheRunsDirectory,
	);

	it(
		"refuses a run that is not recorded",
		verifyApiRunsRunStageTimesRefusesARunThatIsNotRecorded,
	);
});

async function verifyApiRunsRunStageTimesGivesEachStageOfTheRunTheMedianTimeEarlierRunsOfItsCaseTookInIt(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { build: 300_000, discuss: 60_000, review: 100_000 },
	});
	await recordRun(directory, {
		run: SECOND_EARLIER,
		stageMs: { build: 500_000, discuss: 120_000, review: 140_000 },
	});
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		stages: [
			{ medianMs: 90_000, stage: "discuss", state: "available" },
			{ medianMs: 400_000, stage: "build", state: "available" },
			{ medianMs: 120_000, stage: "review", state: "available" },
		],
	});
}

async function verifyApiRunsRunStageTimesTakesTheMiddleTimeNotTheMeanOfAnOddCountOfEarlierRuns(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: "2026-09-28T10-00-00.000Z",
		stageMs: { build: 500_000 },
	});
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { build: 300_000 },
	});
	await recordRun(directory, {
		run: SECOND_EARLIER,
		stageMs: { build: 310_000 },
	});
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: [
			unrecorded("discuss"),
			{ medianMs: 310_000, stage: "build", state: "available" },
			unrecorded("review"),
		],
	});
}

async function verifyApiRunsRunStageTimesLeavesOutRunsOfAnotherCaseAndRunsStartedAfterThisOne(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { discuss: 60_000 },
	});
	await recordRun(directory, {
		caseId: "smoke",
		run: SECOND_EARLIER,
		stageMs: { discuss: 999_000 },
	});
	await recordRun(directory, { run: RUN });
	await recordRun(directory, {
		run: "2026-10-02T10-00-00.000Z",
		stageMs: { discuss: 999_000 },
	});
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: [
			{ medianMs: 60_000, stage: "discuss", state: "available" },
			unrecorded("build"),
			unrecorded("review"),
		],
	});
}

async function verifyApiRunsRunStageTimesLeavesOutTheTimeOfAStageThatStoppedItsRunBeforeItFinished(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { discuss: 60_000 },
	});
	await recordRun(directory, {
		run: SECOND_EARLIER,
		stageMs: { discuss: 5000 },
		stoppedIn: "discuss",
	});
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: [
			{ medianMs: 60_000, stage: "discuss", state: "available" },
			unrecorded("build"),
			unrecorded("review"),
		],
	});
}

async function verifyApiRunsRunStageTimesLeavesOutAnEarlierRecordItCannotReadAndCountsTheRest(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { build: 300_000, discuss: 60_000 },
	});
	await recordRun(directory, {
		run: SECOND_EARLIER,
		stageMs: { discuss: 120_000 },
	});
	await Bun.write(
		benchmarkRunPaths(directory, SECOND_EARLIER).stageFile("build"),
		'{"elapsedMs": 12',
	);
	const unreadableRun = "2026-09-30T12-00-00.000Z";
	await Bun.write(
		benchmarkRunPaths(directory, unreadableRun).manifestFile,
		"{ not json",
	);
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: [
			{ medianMs: 90_000, stage: "discuss", state: "available" },
			{ medianMs: 300_000, stage: "build", state: "available" },
			unrecorded("review"),
		],
	});
}

async function verifyApiRunsRunStageTimesWhenNoEarlierRunRecordedAStageSTimeSaysNoEarlierRunOfTheCaseExists(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: STAGES.map((stage) => ({
			reasons: ["no prior run of this case"],
			stage,
			state: "unavailable",
		})),
	});
}

async function verifyApiRunsRunStageTimesWhenNoEarlierRunRecordedAStageSTimeSaysNoEarlierRunOfTheCaseRecordedThatStageSTime(): Promise<void> {
	const directory = await runsDirectory();
	await recordRun(directory, {
		run: FIRST_EARLIER,
		stageMs: { discuss: 60_000 },
	});
	await recordRun(directory, { run: RUN });
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(await response.json()).toEqual({
		stages: [
			{ medianMs: 60_000, stage: "discuss", state: "available" },
			unrecorded("build"),
			unrecorded("review"),
		],
	});
}

async function verifyApiRunsRunStageTimesRefusesARunNameThatLeavesTheRunsDirectory(): Promise<void> {
	const directory = await runsDirectory();
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes("a/b");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyApiRunsRunStageTimesRefusesARunThatIsNotRecorded(): Promise<void> {
	const directory = await runsDirectory();
	const api = await startEvidenceApi(directory);

	const response = await api.savedEvidence.stageTimes(RUN);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
