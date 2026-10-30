import { describe, expect, it } from "bun:test";

import { parseArgs } from "./config";
import runPipelineConfirmation from "./pipeline-confirmation";
import PipelineConfirmationClock from "./pipeline-confirmation-clock-test-fixture";
import {
	readGroup,
	readReps,
} from "./pipeline-confirmation-record-test-reader";
import { PipelineConfirmationHarness } from "./pipeline-confirmation-test-support";
import { readShortIds } from "./short-id";
import { AUDIT_LOG_PIPELINE_PATH, TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function recordsTheResolvedJudgeModelInPipelineConfirmationEvidence(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const config = parseArgs(
		[
			"--target",
			harness.sourceRoot,
			"--model",
			"sonnet",
			"--effort",
			"medium",
			"--session-budget-usd",
			"5",
		],
		{},
		{
			caseId: "audit-log",
			pipelinePath: AUDIT_LOG_PIPELINE_PATH,
			targetPath: harness.sourceRoot,
		},
	);

	const outcome = await harness.run({
		judgeModel: config.judgeModel,
		model: config.model,
	});
	const group = await readGroup(outcome);

	expect({
		judgeModel: group.inputs.judgeModel,
		model: group.inputs.model,
	}).toEqual({ judgeModel: "opus", model: "sonnet" });
}

async function recordsOnTheGroupTheSpendCeilingEachRepRanUnder(): Promise<void> {
	const expectedSpendCeilingUsd = 12;

	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({ spendCeilingUsd: 12 });
	const group = await readGroup(outcome);

	expect(group.inputs.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
	// The frozen input hash is an independent d020bf3a byte golden.
	const pipeline = group.inputs.files.find(({ kind }) => kind === "pipeline");
	expect(pipeline?.sha256).toBe(
		"611398dd31b7ec8da4007fc338505d7300ae14b09c2a024a218f6b98e1dfa78e",
	);
}

async function recordsOnTheGroupTheInstantItsRepsStarted(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);
	const { now, wallClock } = new PipelineConfirmationClock();

	const outcome = await harness.run({ now, wallClock });

	const group = await readGroup(outcome);
	expect(group.startedAt).toBe("2026-10-08T10:15:00.000Z");
}

async function recordsOnTheGroupThatItsRepsRanUnderTheActualSetup(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({});
	const group = await readGroup(outcome);

	expect(group.inputs.setup).toBe("actual");
}

async function namesTheCaseItsGroupAndRepRecordsRan(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({ caseId: "audit-log-follow-up" });
	const group = await readGroup(outcome);
	const reps = await readReps(outcome);

	expect(group.caseId).toBe("audit-log-follow-up");
	expect(reps.map(({ caseId }) => caseId)).toEqual(
		reps.map(() => "audit-log-follow-up"),
	);
}

async function claimsTheGroupAShortIdInItsCase(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({ caseId: "audit-log-follow-up" });
	const group = await readGroup(outcome);

	expect(
		await readShortIds(harness.runsDirectory, "audit-log-follow-up"),
	).toEqual([
		{
			record: { groupId: group.groupId, kind: "group" },
			shortId: "audit-log-follow-up/g1",
		},
	]);
}

describe(runPipelineConfirmation.name, () => {
	describe("when freezing and claiming the group inputs", () => {
		it(
			"records the resolved Judge model in pipeline confirmation evidence",
			recordsTheResolvedJudgeModelInPipelineConfirmationEvidence,
		);
		it(
			"records on the group the spend ceiling each rep ran under",
			recordsOnTheGroupTheSpendCeilingEachRepRanUnder,
		);
		it(
			"records on the group the instant its reps started",
			recordsOnTheGroupTheInstantItsRepsStarted,
		);
		it(
			"records on the group that its reps ran under the actual setup",
			recordsOnTheGroupThatItsRepsRanUnderTheActualSetup,
		);
		it(
			"names the case its group and rep records ran",
			namesTheCaseItsGroupAndRepRecordsRan,
		);
		it(
			"claims the group a short id in its case",
			claimsTheGroupAShortIdInItsCase,
		);
	});
});
