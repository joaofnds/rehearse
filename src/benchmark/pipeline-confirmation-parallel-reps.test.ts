import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runCommand } from "./command";
import runPipelineConfirmation from "./pipeline-confirmation";
import ParallelPipelineFake from "./pipeline-confirmation-parallel-test-fake";
import {
	readFirstRep,
	readGroup,
	readReps,
	readSuccessfulFinalEvidence,
} from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const CONFIRMATION_REP_COUNT = 3;

const PRIMARY_WORKTREE_COUNT = 1;

const DISCUSSION_OVERLAP_LIMIT_MS = 400;

const THIRD_REP_RECORD_INDEX = 2;

const PAIR_ITEM_COUNT = 2;

const JUDGE_FAILURE_REP_POSITION = 2;

const testResources = TestResources.forEachTest();

async function repositoryState(directory: string): Promise<{
	readonly head: string;
	readonly branch: string;
	readonly status: string;
	readonly base: Uint8Array;
}> {
	return {
		base: await Bun.file(join(directory, "base.txt")).bytes(),
		branch: await runCommand(["git", "branch", "--show-current"], directory),
		head: await runCommand(["git", "rev-parse", "HEAD"], directory),
		status: await runCommand(["git", "status", "--porcelain"], directory),
	};
}

async function runsThreeFrozenFullPipelineRepsConcurrently(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();

	const execution = harness.run({ now: parallel.now }, parallel.override);
	await parallel.waitForAllStarts();
	expect(parallel.events.size).toBe(CONFIRMATION_REP_COUNT);
	parallel.releaseWorkers();
	const records = await readReps(await execution);

	expect(records.every(({ stages }) => stages.length === PAIR_ITEM_COUNT)).toBe(
		true,
	);
	expect(
		records.every(({ stages }) => {
			const [discuss] = stages;
			return (
				discuss?.status === "JUDGED" &&
				discuss.elapsedMs < DISCUSSION_OVERLAP_LIMIT_MS
			);
		}),
	).toBe(true);
	expect([...parallel.events.values()]).toEqual([
		["discuss", "build", "final"],
		["discuss", "build", "final"],
		["discuss", "build", "final"],
	]);
}

async function recordsEachRepetitionsOwnOutcomeAndMissingMetrics(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	parallel.releaseWorkers();

	const outcome = await harness.run({}, parallel.override);
	const records = await readReps(outcome);
	const [, observedSecondRecord] = records;

	expect(records.map(({ outcome: result }) => result)).toEqual([
		"SUCCESSFUL",
		"UNSUCCESSFUL",
		"UNSUCCESSFUL",
	]);
	expect(observedSecondRecord?.metrics.status).toBe("MISSING");
	expect(records.map(({ finalOutcome }) => finalOutcome.status)).toEqual([
		"JUDGED",
		"JUDGED",
		"EXECUTION_FAILED",
	]);
	expect(records[JUDGE_FAILURE_REP_POSITION]?.finalOutcome).toMatchObject({
		error: "Final Judge rejected both attempts",
		evidence: { recordFile: "final.json" },
		status: "EXECUTION_FAILED",
	});
}

async function retainsTheRejectedFinalJudgesEvidenceRevision(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	parallel.releaseWorkers();

	const outcome = await harness.run({}, parallel.override);
	const records = await readReps(outcome);

	expect(
		harness.retained.get(
			"pipeline-confirmation-1/pipeline-confirmation-1-rep-3",
		),
	).toBe(
		records[THIRD_REP_RECORD_INDEX]?.finalOutcome.status === "EXECUTION_FAILED"
			? records[THIRD_REP_RECORD_INDEX].finalOutcome.evidence?.resultSha
			: undefined,
	);
}

async function preservesTheSuccessfulFinalVerdictInItsOwnEvidenceFile(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	parallel.releaseWorkers();

	const outcome = await harness.run({}, parallel.override);
	const finalEvidence = await readSuccessfulFinalEvidence(outcome);

	expect(finalEvidence.grade.verdict).toBe("PASS");
}

async function recordsThePipelineModeAndDeclaredStageOrder(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	parallel.releaseWorkers();

	const outcome = await harness.run({}, parallel.override);
	const group = await readGroup(outcome);

	expect(group.mode).toBe("pipeline");
	expect(group.declaredStages).toEqual(["discuss", "build"]);
}

async function leavesThePrimaryCheckoutAndItsWorktreeRegistrationUnchanged(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	const primaryBefore = await repositoryState(harness.sourceRoot);
	parallel.releaseWorkers();

	await harness.run({}, parallel.override);

	expect(await repositoryState(harness.sourceRoot)).toEqual(primaryBefore);
	const worktrees = await runCommand(
		["git", "worktree", "list", "--porcelain"],
		harness.sourceRoot,
	);
	expect(
		worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
	).toHaveLength(PRIMARY_WORKTREE_COUNT);
}

async function removesTheRepetitionsTemporaryRootAfterCompletion(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const parallel = new ParallelPipelineFake();
	parallel.releaseWorkers();

	const outcome = await harness.run({}, parallel.override);
	const firstRecord = await readFirstRep(outcome);

	const temporaryRootExists = await stat(
		dirname(firstRecord.worktreePath),
	).then(
		() => true,
		() => false,
	);
	expect(temporaryRootExists).toBe(false);
}

describe(runPipelineConfirmation.name, () => {
	describe("when running frozen repetitions concurrently", () => {
		it(
			"records each repetition's own outcome and missing metrics",
			recordsEachRepetitionsOwnOutcomeAndMissingMetrics,
		);
		it(
			"retains the rejected final judge's evidence revision",
			retainsTheRejectedFinalJudgesEvidenceRevision,
		);
		it(
			"preserves the successful final verdict in its own evidence file",
			preservesTheSuccessfulFinalVerdictInItsOwnEvidenceFile,
		);
		it(
			"records the pipeline mode and declared stage order",
			recordsThePipelineModeAndDeclaredStageOrder,
		);
		it(
			"leaves the primary checkout and its worktree registration unchanged",
			leavesThePrimaryCheckoutAndItsWorktreeRegistrationUnchanged,
		);
		it(
			"removes the repetitions' temporary root after completion",
			removesTheRepetitionsTemporaryRootAfterCompletion,
		);

		it(
			"runs three frozen full-pipeline reps concurrently",
			runsThreeFrozenFullPipelineRepsConcurrently,
		);
	});
});
