import { afterEach, describe, expect, it } from "bun:test";

import {
	CASE_ID,
	CORPUS_DIGEST,
	corpusPath,
} from "#benchmark/run-records-test-support";
import { liveRun } from "#server/run-ending-test-fixture";
import {
	EarlierStageBuilder,
	taskCard,
} from "#server/run-record-artifacts-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { artifactsIn } from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record upstream artifacts", () => {
	it(
		"lists a stage's checkpointed instruction files and the task card it alone changed",
		verifyListsAStageSCheckpointedInstructionFilesAndThe,
	);

	it(
		"names the task declaration and the target at the initial checkpoint as a first stage's artifacts in",
		verifyNamesTheTaskDeclarationAndTheTargetAtThe,
	);

	it(
		"names a stopped stage's upstream as the stage before it and each workflow-state file an earlier stage changed",
		verifyNamesAStoppedStageSUpstreamAsTheStage,
	);

	it(
		"names each earlier stage whose workflow-state changes a running stage's inputs cannot read",
		verifyNamesEachEarlierStageWhoseWorkflowStateChangesA,
	);

	it(
		"names each workflow-state file by the latest earlier stage that changed it, leaving out one an earlier stage removed",
		verifyNamesEachWorkflowStateFileByTheLatestEarlier,
	);
});

async function verifyListsAStageSCheckpointedInstructionFilesAndThe(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				artifactsOut: {
					declared: { paths: [], state: "available" },
					workflowState: {
						changes: [{ change: "modified", path: taskCard }],
						state: "available",
					},
				},
				checkpoint: "recorded",
				instructionFiles: {
					files: [{ path: corpusPath("discuss"), sha256: CORPUS_DIGEST }],
					state: "available",
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyNamesTheTaskDeclarationAndTheTargetAtThe(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await fixture.claim(CASE_ID, [{ kind: "run", run: fixture.stoppedRun }]);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				artifactsIn: {
					entries: [
						{ from: "task declaration", taskId: "ACT-1" },
						{
							checkpointShortId: {
								shortId: `${CASE_ID}/r1/s0`,
								state: "available",
							},
							from: "upstream checkpoint",
							target: "template",
							upstream: "initial",
						},
					],
					missing: [],
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyNamesAStoppedStageSUpstreamAsTheStage(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await fixture.claim(CASE_ID, [{ kind: "run", run: fixture.stoppedRun }]);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				artifactsIn: {
					entries: [
						{ from: "task declaration", taskId: "ACT-1" },
						{
							checkpointShortId: {
								shortId: `${CASE_ID}/r1/s1`,
								state: "available",
							},
							from: "upstream checkpoint",
							target: "template",
							upstream: "discuss",
						},
						{
							change: "modified",
							from: "earlier stage",
							path: taskCard,
							stage: "discuss",
						},
					],
					missing: [],
				},
				stage: "build",
			},
		],
	});
}

async function verifyNamesEachEarlierStageWhoseWorkflowStateChangesA(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun();

	const response = await runRecord(fixture, fixture.runningRun, liveRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				artifactsIn: {
					entries: [
						{ from: "task declaration", taskId: "ACT-1" },
						{
							checkpointShortId: { state: "unavailable" },
							from: "upstream checkpoint",
							upstream: "discuss",
						},
					],
					missing: [
						{
							part: "discuss",
							reason: "the stage saved no checkpoint to compare",
						},
					],
				},
				stage: "build",
			},
		],
	});
}

function verifyNamesEachWorkflowStateFileByTheLatestEarlier(): void {
	const upstream = {
		checkpointShortId: { reasons: [], state: "unavailable" },
		target: "template",
		upstream: "review",
	} as const;

	const inputs = artifactsIn("ACT-1", upstream, [
		new EarlierStageBuilder({ stage: "discuss" })
			.withWorkflowChanges([
				{ change: "added", path: "plan.md" },
				{ change: "added", path: "notes.md" },
			])
			.build(),
		new EarlierStageBuilder({ stage: "plan" })
			.withWorkflowChanges([
				{ change: "modified", path: "plan.md" },
				{ change: "removed", path: "notes.md" },
			])
			.build(),
		new EarlierStageBuilder({ stage: "review" })
			.withWorkflowChanges([{ change: "modified", path: taskCard }])
			.build(),
	]);

	expect(inputs.entries).toEqual([
		{ from: "task declaration", taskId: "ACT-1" },
		{ from: "upstream checkpoint", ...upstream },
		{
			change: "modified",
			from: "earlier stage",
			path: "plan.md",
			stage: "plan",
		},
		{
			change: "modified",
			from: "earlier stage",
			path: taskCard,
			stage: "review",
		},
	]);
}
