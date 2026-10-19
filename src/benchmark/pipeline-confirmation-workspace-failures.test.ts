import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import runPipelineConfirmation from "./pipeline-confirmation";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import PipelineWorkspaceFake from "./pipeline-confirmation-workspace-test-fake";
import { TestResources } from "./test-support";

const SECOND_REP_ORDINAL = 2;

const THIRD_REP_ORDINAL = 3;

const INITIAL_CONFIRMATION_REP_COUNT = 2;

const FIRST_RECORDED_STAGE_INDEX = 0;

const PREFIX_START_INDEX = 0;

const testResources = TestResources.forEachTest();

async function attributesWorktreeCreationFailuresWithoutPreservingAnUncreatedWorktree(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const workspace = new PipelineWorkspaceFake({ collideFirstWorktree: true });

	const outcome = await harness.run({}, workspace.override);
	const records = await readReps(outcome);
	const [failed] = records;

	expect(failed?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "worktree creation failed: synthetic worktree collision",
		status: "EXECUTION_FAILED",
	});
	expect(workspace.started.toSorted((left, right) => left - right)).toEqual([
		SECOND_REP_ORDINAL,
		THIRD_REP_ORDINAL,
	]);
	expect(harness.logs).not.toContain(
		`Pipeline rep ${failed?.repId} failed; evidence preserved at ${failed?.worktreePath}`,
	);
	expect(
		await stat(dirname(failed?.worktreePath ?? "missing")).then(
			() => true,
			() => false,
		),
	).toBe(false);
}

async function attributesCheckpointMaterializationFailuresAndPreservesTheWorktree(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{},
		new PipelineWorkspaceFake({ rejectFirstCheckpoint: true }).override,
	);
	const records = await readReps(outcome);
	const [failed] = records;
	const preservedPath = failed?.worktreePath ?? "missing";

	expect(failed?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "checkpoint materialization failed: synthetic checkpoint rejection",
		status: "EXECUTION_FAILED",
	});
	expect(harness.logs).toContain(
		`Pipeline rep ${failed?.repId} failed; evidence preserved at ${preservedPath}`,
	);
	expect(harness.removed).not.toContain(preservedPath);
	const preserved = await stat(preservedPath);

	expect(preserved.isDirectory()).toBe(true);
}

async function attributesCorpusInstallationFailuresBeforeEachStageAndPreservesPriorEvidence(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{},
		new PipelineWorkspaceFake({ rejectStageCorpora: true }).override,
	);
	const records = await readReps(outcome);
	const [firstStageFailure] = records;
	const firstPreservedPath = firstStageFailure?.worktreePath ?? "missing";

	expect(firstStageFailure?.stages).toMatchObject([
		{
			error: "corpus installation failed: synthetic discuss corpus rejection",
			stage: "discuss",
			status: "EXECUTION_FAILED",
			worktreePath: firstPreservedPath,
		},
		{
			reason: "discuss execution failed",
			stage: "build",
			status: "NOT_REACHED",
		},
	]);
	expect(
		records
			.slice(PREFIX_START_INDEX, INITIAL_CONFIRMATION_REP_COUNT)
			.map(({ finalOutcome }) => finalOutcome.status),
	).toEqual(["NOT_REACHED", "NOT_REACHED"]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when repetition preparation fails", () => {
		it(
			"preserves the earlier judged stage when later corpus installation fails",
			preservesTheEarlierJudgedStageWhenLaterCorpusInstallationFails,
		);
		it(
			"retains both workspaces whose corpus installation failed",
			retainsBothWorkspacesWhoseCorpusInstallationFailed,
		);
		it(
			"attributes worktree creation failures without preserving an uncreated worktree",
			attributesWorktreeCreationFailuresWithoutPreservingAnUncreatedWorktree,
		);
		it(
			"attributes checkpoint materialization failures and preserves the worktree",
			attributesCheckpointMaterializationFailuresAndPreservesTheWorktree,
		);
		it(
			"attributes corpus installation failures before each stage and preserves prior evidence",
			attributesCorpusInstallationFailuresBeforeEachStageAndPreservesPriorEvidence,
		);
	});
});

async function preservesTheEarlierJudgedStageWhenLaterCorpusInstallationFails(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{},
		new PipelineWorkspaceFake({ rejectStageCorpora: true }).override,
	);
	const [, laterStageFailure] = await readReps(outcome);
	const laterPreservedPath = laterStageFailure?.worktreePath ?? "missing";

	expect(laterStageFailure?.stages).toMatchObject([
		{
			evidence: {
				recordFile: "stages/discuss.json",
			},
			grade: "A",
			stage: "discuss",
			status: "JUDGED",
			verdict: "CONTINUE",
		},
		{
			error: "corpus installation failed: synthetic build corpus rejection",
			stage: "build",
			status: "EXECUTION_FAILED",
			worktreePath: laterPreservedPath,
		},
	]);
}

async function retainsBothWorkspacesWhoseCorpusInstallationFailed(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{},
		new PipelineWorkspaceFake({ rejectStageCorpora: true }).override,
	);
	const [firstStageFailure, laterStageFailure] = await readReps(outcome);
	const firstPreservedPath = firstStageFailure?.worktreePath ?? "missing";
	const laterPreservedPath = laterStageFailure?.worktreePath ?? "missing";

	expect(harness.logs).toContain(
		`Pipeline rep ${firstStageFailure?.repId} failed; evidence preserved at ${firstPreservedPath}`,
	);
	expect(harness.logs).toContain(
		`Pipeline rep ${laterStageFailure?.repId} failed; evidence preserved at ${laterPreservedPath}`,
	);
	expect(
		await Promise.all(
			[firstPreservedPath, laterPreservedPath].map(
				async (path) => await stat(path).then((entry) => entry.isDirectory()),
			),
		),
	).toEqual([true, true]);
}
