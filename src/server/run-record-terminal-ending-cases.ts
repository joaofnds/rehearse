import {
	CASE_ID,
	FINAL_JUDGE_FAILURE,
	STOPPED_RUN_ERROR,
} from "#benchmark/run-records-test-support";
import {
	OPERATOR_STOPPED,
	pausedStatus,
	stoppedStatus,
} from "#benchmark/stopped-status";
import {
	FINISHED_RUN,
	TERMINAL_EVENT_ELAPSED_MS,
	listedAs,
	recordOperatorStop,
	recordPause,
	unlisted,
} from "#server/run-ending-test-fixture";
import type { RunEnding } from "#server/run-ending-test-fixture";

import {
	AWAITING_JUDGMENT_REASON,
	INTERRUPTED_REASON,
	OPERATOR_STOPPED_REASON,
	PAUSED_REASON,
	RUN_FAILED_REASON,
	UNEXPLAINED_END_REASON,
} from "./run-record";

const RECORDED_ENDINGS: readonly RunEnding[] = [
	{
		claim: "gone",
		ending: "a run the final judge passed",
		finalOutcome: { status: "JUDGED", verdict: "PASS" },
		status: listedAs("COMPLETE"),
		write: async (fixture) => {
			await fixture.pipeline.writePipelineRun({
				caseId: CASE_ID,
				run: FINISHED_RUN,
			});
			return FINISHED_RUN;
		},
	},
	{
		claim: "gone",
		ending: "a run the final judge failed",
		finalOutcome: { status: "JUDGED", verdict: "FAIL" },
		status: listedAs("FAILED"),
		write: async (fixture) => {
			await fixture.pipeline.writeFailedVerdictRun(FINISHED_RUN);
			return FINISHED_RUN;
		},
	},
	{
		claim: "gone",
		ending: "a run whose final judge failed",
		finalOutcome: { reason: FINAL_JUDGE_FAILURE, status: "JUDGING_FAILED" },
		status: listedAs("FAILED"),
		write: async (fixture) => {
			await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN);
			return FINISHED_RUN;
		},
	},
	{
		claim: "gone",
		ending: "a run a stage stopped",
		finalOutcome: {
			reason: STOPPED_RUN_ERROR,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(stoppedStatus("build")),
		write: async (fixture) => {
			await fixture.stopped.writeStoppedRun();
			return fixture.stoppedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run the operator stopped while a stage was judged",
		finalOutcome: {
			reason: STOPPED_RUN_ERROR,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(stoppedStatus("build")),
		write: async (fixture) => {
			await fixture.stopped.writeStoppedRun();
			await recordOperatorStop(fixture, fixture.stoppedRun);

			return fixture.stoppedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run reconciliation marked interrupted",
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("INTERRUPTED"),
		write: async (fixture) => {
			await fixture.events.writeInterruptedRun();
			return fixture.interruptedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run that failed",
		finalOutcome: {
			reason: RUN_FAILED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("FAILED"),
		write: async (fixture) => {
			await fixture.events.writeSignalAbortedRun();
			return fixture.abortedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run that recorded run-completed and no artifact",
		finalOutcome: {
			reason: UNEXPLAINED_END_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: unlisted(
			"incomplete: the run recorded run-completed but no artifact",
		),
		write: async (fixture) => {
			await fixture.events.writeCompletedRunWithoutArtifact();
			return fixture.unrecordedArtifactRun;
		},
	},
	{
		claim: "gone",
		ending: "a run the operator stopped after it failed",
		finalOutcome: {
			reason: OPERATOR_STOPPED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(OPERATOR_STOPPED),
		write: async (fixture) => {
			await fixture.events.writeSignalAbortedRun();
			await recordOperatorStop(fixture, fixture.abortedRun);

			return fixture.abortedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run the operator stopped between stages",
		finalOutcome: {
			reason: OPERATOR_STOPPED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(OPERATOR_STOPPED),
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
			await fixture.events.appendRunningEvent(
				"run-failed",
				"",
				TERMINAL_EVENT_ELAPSED_MS,
			);
			await recordOperatorStop(fixture, fixture.runningRun);

			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending: "a paused run",
		finalOutcome: {
			reason: PAUSED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(pausedStatus("build")),
		write: async (fixture) => {
			await fixture.events.writeRunningRun("stage-completed");
			await recordPause(fixture, fixture.runningRun);

			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending: "a paused run reconciliation later marked interrupted",
		finalOutcome: {
			reason: PAUSED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(pausedStatus("build")),
		write: async (fixture) => {
			await fixture.events.writeRunningRun("stage-completed");
			await recordPause(fixture, fixture.runningRun);
			await fixture.events.appendRunningEvent(
				"run-interrupted",
				"build",
				TERMINAL_EVENT_ELAPSED_MS,
			);

			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending: "a paused run the operator stopped before it failed",
		finalOutcome: {
			reason: PAUSED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(pausedStatus("build")),
		write: async (fixture) => {
			await fixture.events.writeSignalAbortedRun();
			await recordPause(fixture, fixture.abortedRun);
			await recordOperatorStop(fixture, fixture.abortedRun);

			return fixture.abortedRun;
		},
	},
	{
		claim: "gone",
		ending: "a run reconciliation marked interrupted while a stage was judged",
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("INTERRUPTED"),
		write: async (fixture) => {
			await fixture.events.writeRunningRun("stage-judging");
			await fixture.stopped.writeAwaitingJudgeRecord(fixture.runningRun);
			await fixture.events.appendRunningEvent(
				"run-interrupted",
				"build",
				TERMINAL_EVENT_ELAPSED_MS,
			);

			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending:
			"a run recorded before run events that died while a stage was judged",
		finalOutcome: {
			reason: AWAITING_JUDGMENT_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("INTERRUPTED"),
		write: async (fixture) => {
			await fixture.stopped.writeAwaitingJudgeRun();
			return fixture.awaitingJudgeRun;
		},
	},
	{
		claim: "gone",
		ending: "a run that recorded neither a stage nor an event",
		finalOutcome: { reason: UNEXPLAINED_END_REASON, status: "NOT_REACHED" },
		status: unlisted("no record: no stage record and no run events"),
		write: async (fixture) => {
			await fixture.events.writeNoRecordRun();
			return fixture.noRecordRun;
		},
	},
];

export { RECORDED_ENDINGS as default };
