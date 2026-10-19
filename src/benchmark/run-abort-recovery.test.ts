import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PendingStage } from "./run-abort";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import { openFileArtifactRunAbort } from "./run-abort-artifact-test-harness";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import RunAbortBuilder from "./run-abort-test-builder";
import { TestResources } from "./test-support";

const TEARDOWN_CALL_COUNT_INCREMENT = 1;

const testResources = TestResources.forEachTest();

async function scratchOperatorStopFile(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-run-signal-"));

	testResources.track(directory);

	return join(directory, "operator-stop.json");
}

async function testWritesThePendingStageAndFailedRunArtifactWithoutAClaudeSession(): Promise<void> {
	const { abort, artifact, artifactFile, stageFile } =
		await openFileArtifactRunAbort({
			prefix: "rehearse-run-abort-",
			resources: testResources,
		});
	const pendingStage: PendingStage = {
		file: stageFile,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	};

	abort.updatePendingStage(pendingStage);
	await abort.writePendingArtifact(artifact);
	await abort.markAborted("stage Judge failed");

	expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
		error: "stage Judge failed",
		stage: "shape",
		status: "STAGE_JUDGE_FAILED",
	});
	expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual({
		...artifact,
		status: "FAILED",
	});
}

async function testRecordsTheFailedRunArtifactWhenStageEvidenceCannotBeWritten(): Promise<void> {
	const expectedDiagnosticCount = 1;

	const diagnostics: string[] = [];

	const { abort, artifact, artifactFile, directory } =
		await openFileArtifactRunAbort({
			dependencies: {
				reportError: (message) => {
					diagnostics.push(message);
				},
			},
			prefix: "rehearse-run-abort-",
			resources: testResources,
		});

	abort.updatePendingStage({
		file: directory,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});
	await abort.writePendingArtifact(artifact);

	await abort.markAborted("stage Judge failed");

	expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual({
		...artifact,
		status: "FAILED",
	});

	const [observedFirstDiagnostic] = diagnostics;

	expect(diagnostics).toHaveLength(expectedDiagnosticCount);
	expect(observedFirstDiagnostic).toContain(
		"Failed to update run artifacts: EISDIR",
	);
}

async function testRecordsOnlyTheFirstAbortReason(): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-run-abort-"));

	testResources.track(directory);

	const stageFile = join(directory, "shape.json");
	const abort = new RunAbortBuilder({
		dependencies: { persistence: fileRunArtifactPersistence },
		request: {
			artifactFile: join(directory, "run.json"),
			operatorStopFile: join(directory, "operator-stop.json"),
		},
	}).build();

	abort.updatePendingStage({
		file: stageFile,
		input: new StageJudgeInputBuilder({ stage: "shape" }).build(),
		stage: "shape",
	});

	await Promise.all([
		abort.markAborted("first reason"),
		abort.markAborted("second reason"),
	]);

	expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
		error: "first reason",
	});
}

async function testRestoresOnceWhenCleanupCallersOverlap(): Promise<void> {
	const expectedTeardownCalls = 1;

	const operatorStopFile = await scratchOperatorStopFile();
	const restored = Promise.withResolvers<undefined>();
	let teardownCalls = 0;
	const abort = new RunAbortBuilder({
		dependencies: { persistence: fileRunArtifactPersistence },
		request: {
			artifactFile: "/tmp/run.json",
			operatorStopFile,
			teardown: async () => {
				teardownCalls += TEARDOWN_CALL_COUNT_INCREMENT;

				await restored.promise;
			},
		},
	}).build();

	const first = abort.teardown();
	const second = abort.teardown();

	expect(teardownCalls).toBe(expectedTeardownCalls);
	restored.resolve();
	await Promise.all([first, second]);
}

describe(createRunAbort.name, () => {
	describe("when abort recovery persists evidence and releases resources", () => {
		it(
			"writes the pending stage and failed run artifact without a Claude session",
			testWritesThePendingStageAndFailedRunArtifactWithoutAClaudeSession,
		);
		it(
			"records the failed run artifact when stage evidence cannot be written",
			testRecordsTheFailedRunArtifactWhenStageEvidenceCannotBeWritten,
		);
		it(
			"records only the first abort reason",
			testRecordsOnlyTheFirstAbortReason,
		);
		it(
			"restores once when cleanup callers overlap",
			testRestoresOnceWhenCleanupCallersOverlap,
		);
	});
});
