import { afterEach, describe, expect, it } from "bun:test";

import { CASE_ID } from "#benchmark/run-records-test-support";
import { FINISHED_RUN, liveRun } from "#server/run-ending-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import {
	MISSING_STAGE_RECORD_REASON,
	STOPPED_GRADE_REASON,
	UNREACHED_STAGE_REASON,
	UNRECORDED_STAGE_REASON,
} from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record missing stages", () => {
	it(
		"names the stage a run is running in as having written no record yet",
		verifyNamesTheStageARunIsRunningInAs,
	);

	it(
		"names a stage after the one a run is in as not reached",
		verifyNamesAStageAfterTheOneARunIs,
	);

	it(
		"names each stage of a finished run without a record as missing its record",
		verifyNamesEachStageOfAFinishedRunWithoutA,
	);

	it(
		"names a stage before the one a run ended in as missing its record",
		verifyNamesAStageBeforeTheOneARunEnded,
	);

	it(
		"reports a stopped stage's letter as not recorded",
		verifyReportsAStoppedStageSLetterAsNotRecorded,
	);
});

async function verifyNamesTheStageARunIsRunningInAs(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun("turn-completed", "discuss");

	const response = await runRecord(fixture, fixture.runningRun, liveRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				blockers: { reasons: [UNRECORDED_STAGE_REASON] },
				sessionCost: { reasons: [UNRECORDED_STAGE_REASON] },
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyNamesAStageAfterTheOneARunIs(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun("turn-completed", "discuss");

	const response = await runRecord(fixture, fixture.runningRun, liveRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				blockers: { reasons: [UNREACHED_STAGE_REASON] },
				grade: { reasons: [UNREACHED_STAGE_REASON] },
				judgeCost: { reasons: [UNREACHED_STAGE_REASON] },
				sessionCost: { reasons: [UNREACHED_STAGE_REASON] },
				stage: "build",
				tokens: { reasons: [UNREACHED_STAGE_REASON] },
				wallTime: { reasons: [UNREACHED_STAGE_REASON] },
			},
		],
	});
}

async function verifyNamesEachStageOfAFinishedRunWithoutA(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writePipelineRun({
		caseId: CASE_ID,
		run: FINISHED_RUN,
	});

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				blockers: { reasons: [MISSING_STAGE_RECORD_REASON] },
				grade: { reasons: [MISSING_STAGE_RECORD_REASON] },
				stage: "discuss",
			},
			{
				blockers: { reasons: [MISSING_STAGE_RECORD_REASON] },
				grade: { reasons: [MISSING_STAGE_RECORD_REASON] },
				stage: "build",
			},
		],
	});
}

async function verifyNamesAStageBeforeTheOneARunEnded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeInterruptedRun();

	const response = await runRecord(fixture, fixture.interruptedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				blockers: { reasons: [MISSING_STAGE_RECORD_REASON] },
				sessionCost: { reasons: [MISSING_STAGE_RECORD_REASON] },
				stage: "discuss",
			},
			{
				sessionCost: { reasons: [UNRECORDED_STAGE_REASON] },
				stage: "build",
			},
		],
	});
}

async function verifyReportsAStoppedStageSLetterAsNotRecorded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				grade: {
					reasons: [STOPPED_GRADE_REASON],
					state: "unavailable",
				},
				stage: "build",
				status: "stopped",
			},
		],
	});
}
