import { describe, expect, it } from "bun:test";

import type { CalibrationResult } from "./contracts";
import { createRunAbort } from "./run-abort";
import {
	RunAbortArtifactHarness,
	openFileArtifactRunAbort,
} from "./run-abort-artifact-test-harness";
import { TestResources, fakeRunAbortSignals } from "./test-support";

const testResources = TestResources.forEachTest();

async function testRecordsAnInterruptedPendingRunArtifactAsFailedAfterTheActiveWriteSettles(): Promise<void> {
	const { abort, artifact, artifactFile, persistence } =
		await new RunAbortArtifactHarness().loadArtifact();
	const blocked = persistence.blockNextWrite();

	const pendingWrite = abort.writePendingArtifact(artifact);

	await blocked.started;

	const abortWrite = abort.markAborted("run interrupted");

	blocked.release();
	await Promise.all([pendingWrite, abortWrite]);

	expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
		...artifact,
		status: "FAILED",
	});
}

async function testLeavesAnArtifactAwaitingReviewAloneWhenASignalArrives(): Promise<void> {
	const diagnostics: string[] = [];

	const signals = fakeRunAbortSignals();
	const { abort, artifact, artifactFile } = await openFileArtifactRunAbort({
		dependencies: {
			...signals,
			reportError: (message) => {
				diagnostics.push(message);
			},
		},
		prefix: "rehearse-run-await-",
		resources: testResources,
	});

	await abort.writePendingArtifact(artifact);
	await abort.awaitArtifactReview();
	await signals.emit("SIGINT");

	expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual(artifact);
	expect(diagnostics).toEqual([
		"\nReceived SIGINT; removing the run's checkout before exit.",
	]);
}

async function testRetainsCompletedCalibrationWhenCompletionIsInterrupted(): Promise<void> {
	const { abort, artifact, artifactFile, persistence } =
		await new RunAbortArtifactHarness().loadArtifact();

	const completeArtifact = {
		...artifact,
		calibration: {
			humanReview: { findings: [], summary: "accepted", verdict: "ACCEPT" },
			instructionsChanged: false,
			rubricChanged: false,
			stageRubricsChanged: [],
		} satisfies CalibrationResult,
		status: "COMPLETE" as const,
	};

	await abort.writePendingArtifact(artifact);

	const blocked = persistence.blockNextWrite();

	const completionWrite = abort.completeArtifact(completeArtifact);

	await blocked.started;

	const abortWrite = abort.markAborted("run interrupted");

	blocked.release();
	await Promise.all([completionWrite, abortWrite]);

	expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
		...completeArtifact,
		status: "FAILED",
	});
}

async function testRunsAtMostOneArtifactTransitionAtATime(): Promise<void> {
	const expectedMaxActiveWrites = 1;

	const { abort, artifact, persistence } =
		await new RunAbortArtifactHarness().loadArtifact();
	const blocked = persistence.blockNextWrite();

	const pendingWrite = abort.writePendingArtifact(artifact);

	await blocked.started;

	const completionWrite = abort.completeArtifact({
		...artifact,
		status: "COMPLETE",
	});

	blocked.release();
	await Promise.all([pendingWrite, completionWrite]);

	expect(persistence.maxActiveWrites).toBe(expectedMaxActiveWrites);
}

describe(createRunAbort.name, () => {
	describe("when artifact writes and interruption overlap", () => {
		it(
			"records an interrupted pending run artifact as failed after the active write settles",
			testRecordsAnInterruptedPendingRunArtifactAsFailedAfterTheActiveWriteSettles,
		);
		it(
			"leaves an artifact awaiting review alone when a signal arrives",
			testLeavesAnArtifactAwaitingReviewAloneWhenASignalArrives,
		);
		it(
			"retains completed calibration when completion is interrupted",
			testRetainsCompletedCalibrationWhenCompletionIsInterrupted,
		);
		it(
			"runs at most one artifact transition at a time",
			testRunsAtMostOneArtifactTransitionAtATime,
		);
	});
});
