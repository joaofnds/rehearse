import { STOPPED_RUN_ERROR } from "#benchmark/run-records-test-support";
import { OPERATOR_STOPPED, pausedStatus } from "#benchmark/stopped-status";
import {
	listedAs,
	recordOperatorStop,
	recordPause,
	unlisted,
} from "#server/run-ending-test-fixture";
import type { EndedRun, RunEnding } from "#server/run-ending-test-fixture";

import {
	AWAITING_JUDGMENT_REASON,
	INTERRUPTED_REASON,
	OPERATOR_STOPPED_REASON,
	PAUSED_REASON,
	RUN_FAILED_REASON,
} from "./run-record";

const CLAIM_ENDINGS: readonly RunEnding[] = [
	{
		claim: "live",
		ending: "a run still executing",
		finalOutcome: { stage: "build", status: "PENDING" },
		status: listedAs("RUNNING"),
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
			return fixture.runningRun;
		},
	},
	{
		claim: "live",
		ending: "a run the operator stopped while its process restores the target",
		finalOutcome: {
			reason: OPERATOR_STOPPED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(OPERATOR_STOPPED),
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
			await recordOperatorStop(fixture, fixture.runningRun);

			return fixture.runningRun;
		},
	},
	{
		claim: "live",
		ending: "a paused run whose process restores the target",
		finalOutcome: {
			reason: PAUSED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs(pausedStatus("build")),
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
			await recordPause(fixture, fixture.runningRun);

			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending: "a run whose process died with no reconciliation since",
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("INTERRUPTED"),
		write: async (fixture) => {
			await fixture.events.writeRunningRun("stage-completed");
			return fixture.runningRun;
		},
	},
	{
		claim: "gone",
		ending: "a run whose process died while a stage was judged",
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		status: listedAs("INTERRUPTED"),
		write: async (fixture) => {
			await fixture.events.writeRunningRun("stage-judging");
			await fixture.stopped.writeAwaitingJudgeRecord(fixture.runningRun);

			return fixture.runningRun;
		},
	},
	{
		claim: "unknown",
		ending: "a run whose target cannot be asked whether it still runs",
		finalOutcome: { stage: "build", status: "PENDING" },
		status: unlisted("run history lists no row for the run"),
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
			return fixture.runningRun;
		},
	},
	{
		claim: "live",
		ending:
			"a run with no events left awaiting judgment whose own claim reads live",
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
];

const RUNS_ENDED_BEFORE_THE_FINAL_JUDGE: readonly EndedRun[] = [
	{
		ending: "a stopped run",
		reason: STOPPED_RUN_ERROR,
		run: (fixture) => fixture.stoppedRun,
		write: async (fixture) => {
			await fixture.stopped.writeStoppedRun();
		},
	},
	{
		ending: "an interrupted run",
		reason: INTERRUPTED_REASON,
		run: (fixture) => fixture.interruptedRun,
		write: async (fixture) => {
			await fixture.events.writeInterruptedRun();
		},
	},
	{
		ending: "an aborted run",
		reason: RUN_FAILED_REASON,
		run: (fixture) => fixture.abortedRun,
		write: async (fixture) => {
			await fixture.events.writeSignalAbortedRun();
		},
	},
	{
		ending: "a run that died awaiting judgment",
		reason: AWAITING_JUDGMENT_REASON,
		run: (fixture) => fixture.awaitingJudgeRun,
		write: async (fixture) => {
			await fixture.stopped.writeAwaitingJudgeRun();
		},
	},
];

export { CLAIM_ENDINGS, RUNS_ENDED_BEFORE_THE_FINAL_JUDGE };
