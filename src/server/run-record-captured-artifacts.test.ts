import { afterEach, describe, expect, it } from "bun:test";

import {
	CASE_ID,
	CORPUS_DIGEST,
	corpusPath,
} from "#benchmark/run-records-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { FINISHED_RUN } from "#server/run-ending-test-fixture";
import {
	addedCard,
	buildChangedPaths,
	buildCommitSubjects,
	taskCard,
	untouchedCard,
} from "#server/run-record-artifacts-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

afterEach(clearRunRecordRoots);

describe("run record captured artifacts", () => {
	it(
		"serves the read manifest a stage's checkpoint recorded",
		verifyServesTheReadManifestAStageSCheckpointRecorded,
	);

	it(
		"serves the read manifest a stopped stage kept on its stage record",
		verifyServesTheReadManifestAStoppedStageKeptOn,
	);

	it(
		"says a checkpoint recorded before read manifests holds none",
		verifySaysACheckpointRecordedBeforeReadManifestsHoldsNone,
	);

	it(
		"lists each workflow-state entry a stage added, modified or removed against its upstream checkpoint",
		verifyListsEachWorkflowStateEntryAStageAddedModified,
	);

	it(
		"reports workflow-state changes as unavailable when the run holds no checkpoint the stage continued from",
		verifyReportsWorkflowStateChangesAsUnavailableWhenTheRun,
	);

	it(
		"reports the instruction files and declared artifact of a stage awaiting judgment as unavailable",
		verifyReportsTheInstructionFilesAndDeclaredArtifactOfA,
	);

	it("lists a stage's declared artifact", verifyListsAStageSDeclaredArtifact);

	it(
		"lists a stopped stage's commits and instruction files from its stop record and says its checkpoint is missing",
		verifyListsAStoppedStageSCommitsAndInstructionFiles,
	);
});

async function verifyServesTheReadManifestAStageSCheckpointRecorded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const readManifest = [
		{
			evidence: "declared",
			half: "corpus",
			path: "CLAUDE.md",
			role: "global instructions",
			sha256: "1".repeat(SHA256_HEX_DIGITS),
		},
	] as const;
	await fixture.corpus.rewriteDiscussCheckpoint({ readManifest });

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				readManifest: { entries: readManifest, state: "available" },
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyServesTheReadManifestAStoppedStageKeptOn(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const readManifest = [
		{
			evidence: "declared",
			half: "corpus",
			path: "CLAUDE.md",
			role: "global instructions",
			sha256: "1".repeat(SHA256_HEX_DIGITS),
		},
	] as const;
	await fixture.corpus.recordStageReadManifest("build", readManifest);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				readManifest: { entries: readManifest, state: "available" },
				stage: "build",
			},
		],
	});
}

async function verifySaysACheckpointRecordedBeforeReadManifestsHoldsNone(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				readManifest: {
					reasons: ["the checkpoint was recorded before read manifests"],
					state: "unavailable",
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyListsEachWorkflowStateEntryAStageAddedModified(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await fixture.corpus.rewriteDiscussCheckpoint({
		workflowState: [
			{ path: taskCard, sha256: "5".repeat(SHA256_HEX_DIGITS) },
			{ path: addedCard, sha256: "8".repeat(SHA256_HEX_DIGITS) },
		],
	});

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				artifactsOut: {
					workflowState: {
						changes: [
							{ change: "modified", path: taskCard },
							{ change: "added", path: addedCard },
							{ change: "removed", path: untouchedCard },
						],
						state: "available",
					},
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyReportsWorkflowStateChangesAsUnavailableWhenTheRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writePipelineRun({
		caseId: CASE_ID,
		run: FINISHED_RUN,
	});

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				artifactsOut: { workflowState: { state: "unavailable" } },
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyReportsTheInstructionFilesAndDeclaredArtifactOfA(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeAwaitingJudgeRun();

	const response = await runRecord(fixture, fixture.awaitingJudgeRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				artifactsOut: { declared: { state: "unavailable" } },
				instructionFiles: { state: "unavailable" },
				stage: "build",
			},
		],
	});
}

async function verifyListsAStageSDeclaredArtifact(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await fixture.corpus.rewriteDiscussCheckpoint({
		artifacts: [{ path: "PLAN.md", sha256: "6".repeat(SHA256_HEX_DIGITS) }],
	});

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				artifactsOut: {
					declared: { paths: ["PLAN.md"], state: "available" },
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyListsAStoppedStageSCommitsAndInstructionFiles(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				artifactsOut: {
					changedPaths: {
						paths: buildChangedPaths,
						state: "available",
					},
					commitSubjects: {
						state: "available",
						subjects: buildCommitSubjects,
					},
					declared: { state: "unavailable" },
					workflowState: { state: "unavailable" },
				},
				checkpoint: "missing",
				instructionFiles: {
					files: [{ path: corpusPath("build"), sha256: CORPUS_DIGEST }],
					state: "available",
				},
				stage: "build",
			},
		],
	});
}
