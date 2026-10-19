import { describe, expect, it } from "bun:test";

import { createRunAbort } from "./run-abort";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import RunAbortBuilder from "./run-abort-test-builder";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import { fakeRunEventRecorder } from "./test-support";

async function testRecordsATerminalRunFailedEventWhenAnAbortFailsAPendingStageSoAnAttachedSSEClientStopsWaiting(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const stageFile = "/runs/shape.json";
	const abort = new RunAbortBuilder({
		dependencies: { persistence, runEvents },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.writePendingStage({
		file: stageFile,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});
	await abort.markAborted("run interrupted");

	expect(runEvents.events.map(({ kind }) => kind)).toEqual([
		"stage-judging",
		"run-failed",
	]);
}

async function testReportsTheSessionSpendACeilingStopHoldsOnItsRunFailedEvent(): Promise<void> {
	const runEvents = fakeRunEventRecorder();
	const abort = new RunAbortBuilder({
		dependencies: {
			persistence: new ControlledRunArtifactPersistence(),
			runEvents,
		},
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	abort.stopAtCeiling({
		ceilingUsd: 4.5,
		file: "/runs/build.json",
		productOwner: { providerCalls: [], sessionId: "po", spentUsd: 0 },
		session: { costUsd: 2.3, providerCalls: [{}] },
		spentUsd: 4.5,
		stage: "build",
	});

	await abort.markAborted("Reached maximum budget");

	expect(runEvents.events).toMatchObject([
		{ kind: "run-failed", spentUsd: 2.3, stage: "build" },
	]);
}

async function testRecordsATerminalRunFailedEventWhenAbortHasNoPendingStageOrArtifactSoABareSignalAbortStillEndsTheSSEStream(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const abort = new RunAbortBuilder({
		dependencies: { persistence, runEvents },
		request: {
			artifactFile: "/runs/run.json",
			operatorStopFile: "/runs/operator-stop.json",
		},
	}).build();

	await abort.markAborted("run interrupted");

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
}

describe(createRunAbort.name, () => {
	describe("when aborting a stage or an unstarted run", () => {
		it(
			"records a terminal run-failed event when an abort fails a pending stage, so an attached SSE client stops waiting",
			testRecordsATerminalRunFailedEventWhenAnAbortFailsAPendingStageSoAnAttachedSSEClientStopsWaiting,
		);
		it(
			"reports the session spend a ceiling stop holds on its run-failed event",
			testReportsTheSessionSpendACeilingStopHoldsOnItsRunFailedEvent,
		);

		it(
			"records a terminal run-failed event when abort has no pending stage or artifact, so a bare signal abort still ends the SSE stream",
			testRecordsATerminalRunFailedEventWhenAbortHasNoPendingStageOrArtifactSoABareSignalAbortStillEndsTheSSEStream,
		);
	});
});
