import type { RunLiveness } from "#benchmark/run-liveness";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import {
	FINAL_JUDGE_FAILURE,
	STOPPED_RUN_ERROR,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import {
	FINISHED_RUN,
	liveRun,
	reconciledAsInterrupted,
} from "#server/history-figures-workspace-test-fixture";

import { INTERRUPTED_REASON, RUN_FAILED_REASON } from "./run-record";

interface FinalOutcomeCase {
	readonly outcome: string;
	readonly write: (fixture: RecordedRunsFixture) => Promise<void>;
	readonly run: (fixture: RecordedRunsFixture) => string;
	readonly liveness: RunLiveness;
	readonly finalOutcome: Record<string, string>;
}

const FINAL_OUTCOMES: readonly FinalOutcomeCase[] = [
	{
		finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
		liveness: nothingRunning,
		outcome: "the final judge's PASS",
		run: () => FINISHED_RUN,
		write: async (fixture) => {
			await fixture.pipeline.writePipelineRun({
				caseId: "audit-log",
				run: FINISHED_RUN,
			});
		},
	},
	{
		finalOutcome: { state: "available", status: "JUDGED", verdict: "FAIL" },
		liveness: nothingRunning,
		outcome: "the final judge's FAIL",
		run: () => FINISHED_RUN,
		write: async (fixture) => {
			await fixture.pipeline.writeFailedVerdictRun(FINISHED_RUN);
		},
	},
	{
		finalOutcome: {
			reason: FINAL_JUDGE_FAILURE,
			state: "available",
			status: "JUDGING_FAILED",
		},
		liveness: nothingRunning,
		outcome: "judging failed with its reason",
		run: () => FINISHED_RUN,
		write: async (fixture) => {
			await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN);
		},
	},
	{
		finalOutcome: { stage: "build", state: "available", status: "PENDING" },
		liveness: liveRun,
		outcome: "pending while the run executes",
		run: (fixture) => fixture.runningRun,
		write: async (fixture) => {
			await fixture.events.writeRunningRun();
		},
	},
	{
		finalOutcome: {
			reason: STOPPED_RUN_ERROR,
			stage: "build",
			state: "available",
			status: "NOT_REACHED",
		},
		liveness: nothingRunning,
		outcome: "not gradable at the stage a stopped run ended in",
		run: (fixture) => fixture.stoppedRun,
		write: async (fixture) => {
			await fixture.stopped.writeStoppedRun();
		},
	},
	{
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			state: "available",
			status: "NOT_REACHED",
		},
		liveness: nothingRunning,
		outcome: "not gradable at the stage an interrupted run ended in",
		run: (fixture) => fixture.interruptedRun,
		write: async (fixture) => {
			await fixture.events.writeInterruptedRun();
		},
	},
	{
		finalOutcome: {
			reason: RUN_FAILED_REASON,
			stage: "build",
			state: "available",
			status: "NOT_REACHED",
		},
		liveness: nothingRunning,
		outcome: "not gradable at the stage an aborted run ended in",
		run: (fixture) => fixture.abortedRun,
		write: async (fixture) => {
			await fixture.events.writeSignalAbortedRun();
		},
	},
	{
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			state: "available",
			status: "NOT_REACHED",
		},
		liveness: nothingRunning,
		outcome: "not gradable at the stage a run died awaiting judgment in",
		run: (fixture) => fixture.awaitingJudgeRun,
		write: async (fixture) => {
			await fixture.stopped.writeAwaitingJudgeRun();
			await reconciledAsInterrupted(fixture, fixture.awaitingJudgeRun);
		},
	},
];

export { FINAL_OUTCOMES as default };
