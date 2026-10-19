import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";

import runPipelineConfirmation from "./pipeline-confirmation";
import PipelinePeerFailureFake from "./pipeline-confirmation-peer-test-fake";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import { readReliabilityReport } from "./pipeline-confirmation-report-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { TestResources } from "./test-support";

const FIRST_REP_ORDINAL = 1;

const THIRD_REP_ORDINAL = 3;

const FIRST_RECORDED_STAGE_INDEX = 0;

const SECOND_RECORDED_STAGE_INDEX = 1;

const SECOND_REP_RECORD_INDEX = 1;

const JUDGE_FAILURE_REP_POSITION = 2;

const testResources = TestResources.forEachTest();

async function letsPipelinePeersFinishAndPreservesOnlyAPreEvidenceFailure(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const peers = new PipelinePeerFailureFake();

	const outcome = await harness.run(
		{ groupId: "pipeline-failures" },
		peers.override,
	);
	const records = await readReps(outcome);
	const [, observedUpdatedSecondRecord, observedUpdatedThirdRecord] = records;

	expect(peers.finished.toSorted((left, right) => left - right)).toEqual([
		FIRST_REP_ORDINAL,
		THIRD_REP_ORDINAL,
	]);
	expect(
		records.map(({ stages }) => stages.map(({ status }) => status)),
	).toEqual([
		["JUDGED", "NOT_REACHED"],
		["EXECUTION_FAILED", "NOT_REACHED"],
		["JUDGED", "EXECUTION_FAILED"],
	]);
	expect(
		observedUpdatedSecondRecord?.stages[FIRST_RECORDED_STAGE_INDEX],
	).toMatchObject({ error: "worker failed before evidence" });
	expect(
		observedUpdatedThirdRecord?.stages[SECOND_RECORDED_STAGE_INDEX],
	).toMatchObject({ error: "Judge rejected both attempts" });
	expect(
		records.every(({ outcome: result }) => result === "UNSUCCESSFUL"),
	).toBe(true);
}

async function preservesTheWorktreeWhoseWorkerFailedBeforeEvidence(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const peers = new PipelinePeerFailureFake();

	const outcome = await harness.run(
		{ groupId: "pipeline-failures" },
		peers.override,
	);
	const records = await readReps(outcome);
	const preservedPath =
		records[SECOND_REP_RECORD_INDEX]?.worktreePath ?? "missing";

	expect(harness.logs).toContain(
		`Pipeline rep pipeline-failures-rep-2 failed; evidence preserved at ${preservedPath}`,
	);
	const preserved = await stat(preservedPath);
	expect(preserved.isDirectory()).toBe(true);
	expect(harness.removed).not.toContain(preservedPath);
}

async function removesTheJudgedPeersWorktreeAndRetainsItsRevision(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const peers = new PipelinePeerFailureFake();

	const outcome = await harness.run(
		{ groupId: "pipeline-failures" },
		peers.override,
	);
	const records = await readReps(outcome);
	const [observedFirstRecord] = records;
	const observedThirdRecord = records[JUDGE_FAILURE_REP_POSITION];

	expect(harness.removed).toContain(
		observedThirdRecord?.worktreePath ?? "missing",
	);
	expect(observedFirstRecord?.metrics.status).toBe("COMPLETE");
	expect(
		harness.retained.has("pipeline-failures/pipeline-failures-rep-1"),
	).toBe(true);
	expect(
		harness.retained.has("pipeline-failures/pipeline-failures-rep-3"),
	).toBe(true);
}

async function reportsReliabilityFromThePeersThatReachedTheStage(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const peers = new PipelinePeerFailureFake();

	const outcome = await harness.run(
		{ groupId: "pipeline-failures" },
		peers.override,
	);
	const report = await readReliabilityReport(outcome);
	const [observedFirstReliability] = report.reliability;

	expect(observedFirstReliability).toMatchObject({
		name: "discuss",
		successful: 1,
	});
}

describe(runPipelineConfirmation.name, () => {
	describe("when one repetition fails before evidence and its peers finish", () => {
		it(
			"lets pipeline peers finish and preserves only a pre-evidence failure",
			letsPipelinePeersFinishAndPreservesOnlyAPreEvidenceFailure,
		);
		it(
			"preserves the worktree whose worker failed before evidence",
			preservesTheWorktreeWhoseWorkerFailedBeforeEvidence,
		);
		it(
			"removes the judged peer's worktree and retains its revision",
			removesTheJudgedPeersWorktreeAndRetainsItsRevision,
		);
		it(
			"reports reliability from the peers that reached the stage",
			reportsReliabilityFromThePeersThatReachedTheStage,
		);
	});
});
