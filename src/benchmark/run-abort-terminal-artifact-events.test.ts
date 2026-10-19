import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { JudgeOutputValidationError } from "./judge-attempt";
import { createRunAbort } from "./run-abort";
import {
	RunAbortArtifactHarness,
	loadDefaultPipeline,
} from "./run-abort-artifact-test-harness";
import RunAbortBuilder from "./run-abort-test-builder";
import { buildFailedJudgeRunArtifact } from "./run-artifact";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import RunArtifactBaseInputsBuilder from "./run-artifact-test-fixtures";
import { AUDIT_LOG_PIPELINE_PATH, fakeRunEventRecorder } from "./test-support";

async function testRecordsATerminalRunFailedEventWhenAnAbortFailsAPendingRunArtifact(): Promise<void> {
	const runEvents = fakeRunEventRecorder();

	const { abort, artifact } = await new RunAbortArtifactHarness({
		runEvents,
	}).loadArtifact();

	await abort.writePendingArtifact(artifact);
	await abort.markAborted("run interrupted");

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
}

async function testRecordsATerminalRunFailedEventWhenWriteFailedArtifactPersistsAFinalJudgeFailure(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
	const runEvents = fakeRunEventRecorder();
	const artifactFile = "/runs/run.json";
	const pipeline = await loadDefaultPipeline();
	const judgeFailure = new JudgeOutputValidationError({
		attempts: [],
		costUsd: 0,
		message: "invalid Judge output",
		prompt: "judge prompt",
	});
	const artifact = buildFailedJudgeRunArtifact(
		new RunArtifactBaseInputsBuilder()
			.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
			.build(),
		{ ceilingStop: undefined, failure: judgeFailure },
	);
	const abort = new RunAbortBuilder({
		dependencies: { persistence, runEvents },
		request: {
			artifactFile,
			operatorStopFile: join(dirname(artifactFile), "operator-stop.json"),
		},
	}).build();

	await abort.writeFailedArtifact(artifact);

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
}

describe(createRunAbort.name, () => {
	describe("when aborting a pending or rejected run artifact", () => {
		it(
			"records a terminal run-failed event when an abort fails a pending run artifact",
			testRecordsATerminalRunFailedEventWhenAnAbortFailsAPendingRunArtifact,
		);
		it(
			"records a terminal run-failed event when writeFailedArtifact persists a final Judge failure",
			testRecordsATerminalRunFailedEventWhenWriteFailedArtifactPersistsAFinalJudgeFailure,
		);
	});
});
