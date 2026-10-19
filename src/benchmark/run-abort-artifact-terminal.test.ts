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

async function testLeavesASuccessfulTerminalArtifactUnchangedOnALaterAbort(): Promise<void> {
	const { abort, artifact, artifactFile, persistence } =
		await new RunAbortArtifactHarness().loadArtifact();
	const completeArtifact = { ...artifact, status: "COMPLETE" as const };

	await abort.writePendingArtifact(artifact);
	await abort.completeArtifact(completeArtifact);
	await abort.markAborted("later failure");

	expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual(
		completeArtifact,
	);
}

async function testRetainsPendingStateAfterATerminalArtifactWriteFails(): Promise<void> {
	const { abort, artifact, artifactFile, persistence } =
		await new RunAbortArtifactHarness().loadArtifact();
	const completeArtifact = { ...artifact, status: "COMPLETE" as const };

	await abort.writePendingArtifact(artifact);

	const failure = persistence.failNextWrite();

	expect(abort.completeArtifact(completeArtifact)).rejects.toBe(failure);
	await abort.markAborted("run failed");

	expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
		...completeArtifact,
		status: "FAILED",
	});
}

async function testRetriesAFailedFinalJudgeArtifactDuringAbortRecording(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
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
		dependencies: { persistence },
		request: {
			artifactFile,
			operatorStopFile: join(dirname(artifactFile), "operator-stop.json"),
		},
	}).build();
	const persistenceFailure = persistence.failNextWrite();

	expect(abort.writeFailedArtifact(artifact)).rejects.toBe(persistenceFailure);
	await abort.markAborted("run failed");

	expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual(
		artifact,
	);
}

async function testDoesNotRewriteASuccessfullyPersistedFinalJudgeFailure(): Promise<void> {
	const expectedWriteCount = 1;

	const persistence = new ControlledRunArtifactPersistence();
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
		dependencies: { persistence },
		request: {
			artifactFile,
			operatorStopFile: join(dirname(artifactFile), "operator-stop.json"),
		},
	}).build();

	await abort.writeFailedArtifact(artifact);
	await abort.markAborted("later failure");

	expect(persistence.writes).toHaveLength(expectedWriteCount);
}

async function testRecordsASingleRunFailedEventWhenAbortFollowsAPersistedFinalJudgeFailureNotASecondEmptyOne(): Promise<void> {
	const persistence = new ControlledRunArtifactPersistence();
	const artifactFile = "/runs/run.json";
	const pipeline = await loadDefaultPipeline();
	const runEvents = fakeRunEventRecorder();
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
	await abort.markAborted("later failure");

	expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
}

describe(createRunAbort.name, () => {
	describe("after a terminal artifact transition", () => {
		it(
			"leaves a successful terminal artifact unchanged on a later abort",
			testLeavesASuccessfulTerminalArtifactUnchangedOnALaterAbort,
		);
		it(
			"retains pending state after a terminal artifact write fails",
			testRetainsPendingStateAfterATerminalArtifactWriteFails,
		);
		it(
			"retries a failed final Judge artifact during abort recording",
			testRetriesAFailedFinalJudgeArtifactDuringAbortRecording,
		);
		it(
			"does not rewrite a successfully persisted final Judge failure",
			testDoesNotRewriteASuccessfullyPersistedFinalJudgeFailure,
		);
		it(
			"records a single run-failed event when abort follows a persisted final Judge failure, not a second empty one",
			testRecordsASingleRunFailedEventWhenAbortFollowsAPersistedFinalJudgeFailureNotASecondEmptyOne,
		);
	});
});
