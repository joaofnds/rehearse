import { afterEach, describe, expect, it } from "bun:test";

import {
	FINAL_JUDGE_FAILURE,
	claimBy,
} from "#benchmark/run-records-test-support";
import {
	FINISHED_RUN,
	RUN_OWNER_PID,
	liveRun,
} from "#server/run-ending-test-fixture";
import { RUNS_ENDED_BEFORE_THE_FINAL_JUDGE } from "#server/run-record-claim-ending-cases";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { INTERRUPTED_REASON, UNEXPLAINED_END_REASON } from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record final judgement", () => {
	it(
		"reports the final judge's PASS on a finished run",
		verifyReportsTheFinalJudgeSPASSOnAFinished,
	);

	it(
		"reports the final judge's FAIL on a finished run",
		verifyReportsTheFinalJudgeSFAILOnAFinished,
	);

	it(
		"reports judging failed with the failure the artifact records",
		verifyReportsJudgingFailedWithTheFailureTheArtifactRecords,
	);
});

describe("run record final outcome before judgement", () => {
	it(
		"reports pending while the run is still executing",
		verifyReportsPendingWhileTheRunIsStillExecuting,
	);

	it(
		"reports a crashed run as interrupted while a later run holds its target",
		verifyReportsACrashedRunAsInterruptedWhileALater,
	);

	it(
		"reports pending while a live run's stage awaits its judge",
		verifyReportsPendingWhileALiveRunSStageAwaits,
	);

	it(
		"reports an interrupted run that left a stage awaiting judgment as interrupted",
		verifyReportsAnInterruptedRunThatLeftAStageAwaiting,
	);

	it(
		"reports a run with no events as not reached even while another run holds its target",
		verifyReportsARunWithNoEventsAsNotReached,
	);

	it(
		"reports a run that recorded neither a stage nor an event as not reached for an unrecorded reason",
		verifyReportsARunThatRecordedNeitherAStageNor,
	);

	it.each(RUNS_ENDED_BEFORE_THE_FINAL_JUDGE.map((row) => [row.ending, row]))(
		"reports %s as not reached at the stage it ended in",
		async (_ending, { write, run, reason }) => {
			const fixture = await emptyFixture();
			await write(fixture);

			const response = await runRecord(fixture, run(fixture));

			expect(await response.json()).toMatchObject({
				finalOutcome: { reason, stage: "build", status: "NOT_REACHED" },
			});
		},
	);
});

async function verifyReportsTheFinalJudgeSPASSOnAFinished(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: FINISHED_RUN,
	});

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		finalOutcome: { status: "JUDGED", verdict: "PASS" },
	});
}

async function verifyReportsTheFinalJudgeSFAILOnAFinished(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFailedVerdictRun(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		finalOutcome: { status: "JUDGED", verdict: "FAIL" },
	});
}

async function verifyReportsJudgingFailedWithTheFailureTheArtifactRecords(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		finalOutcome: {
			reason: FINAL_JUDGE_FAILURE,
			status: "JUDGING_FAILED",
		},
	});
}

async function verifyReportsPendingWhileTheRunIsStillExecuting(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun();

	const response = await runRecord(fixture, fixture.runningRun, liveRun);

	expect(await response.json()).toMatchObject({
		finalOutcome: { stage: "build", status: "PENDING" },
	});
}

async function verifyReportsACrashedRunAsInterruptedWhileALater(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun();
	await fixture.events.writeLaterRunningRun();

	const response = await runRecord(fixture, fixture.runningRun, {
		isAlive: () => true,
		readMarker: async () =>
			await Promise.resolve(claimBy(fixture.laterRunningRun, RUN_OWNER_PID)),
	});

	expect(await response.json()).toMatchObject({
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
	});
}

async function verifyReportsPendingWhileALiveRunSStageAwaits(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun();
	await fixture.stopped.writeAwaitingJudgeRecord(fixture.runningRun);

	const response = await runRecord(fixture, fixture.runningRun, liveRun);

	expect(await response.json()).toMatchObject({
		finalOutcome: { status: "PENDING" },
	});
}

async function verifyReportsAnInterruptedRunThatLeftAStageAwaiting(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeInterruptedRun();
	await fixture.stopped.writeAwaitingJudgeRecord(fixture.interruptedRun);

	const response = await runRecord(fixture, fixture.interruptedRun);

	expect(await response.json()).toMatchObject({
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
	});
}

async function verifyReportsARunWithNoEventsAsNotReached(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeNoRecordRun();

	const response = await runRecord(fixture, fixture.noRecordRun, liveRun);

	expect(await response.json()).toMatchObject({
		finalOutcome: {
			reason: UNEXPLAINED_END_REASON,
			status: "NOT_REACHED",
		},
	});
}

async function verifyReportsARunThatRecordedNeitherAStageNor(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeNoRecordRun();

	const response = await runRecord(fixture, fixture.noRecordRun);

	expect(await response.json()).toMatchObject({
		finalOutcome: {
			reason: UNEXPLAINED_END_REASON,
			status: "NOT_REACHED",
		},
	});
}
