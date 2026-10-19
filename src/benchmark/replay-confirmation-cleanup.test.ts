import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";

import runReplayConfirmation from "./replay-confirmation";
import ReplayCheckpointInputsBuilder from "./replay-confirmation-checkpoint-test-builder";
import ReplayDurableOutcomes from "./replay-confirmation-durable-outcome-test-fixture";
import {
	readReplayEvidenceRefs,
	readReplayJudgeEvidence,
	readReplayReps,
} from "./replay-confirmation-worktree-test-fixtures";
import { TestResources } from "./test-support";

const FIRST_REP_RECORD_INDEX = 0;
const FIRST_RECORDED_STAGE_INDEX = 0;
const testResources = TestResources.forEachTest();

const removesEveryDurablyRecordedWorktree = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const provider = new ReplayDurableOutcomes();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-cleanup", reps: 2 },
		provider.override,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	const temporaryRoot = dirname(
		records[FIRST_REP_RECORD_INDEX]?.worktreePath ?? "missing",
	);

	expect(
		records.map(({ stages }) => stages[FIRST_RECORDED_STAGE_INDEX]?.status),
	).toEqual(["JUDGED", "EXECUTION_FAILED"]);
	expect(
		provider.removed.toSorted((left, right) => left.localeCompare(right)),
	).toEqual(
		records
			.map(({ worktreePath }) => worktreePath)
			.toSorted((left, right) => left.localeCompare(right)),
	);
	expect(
		await stat(temporaryRoot).then(
			() => true,
			() => false,
		),
	).toBe(false);
};
const retainsDurableRefsAndJudgeEvidence = async (): Promise<void> => {
	const inputs = await new ReplayCheckpointInputsBuilder().fromRepository(
		testResources,
	);
	const provider = new ReplayDurableOutcomes();
	const { dependencies, request } = provider.prepareConfirmation(
		inputs,
		{ groupId: "confirmation-cleanup", reps: 2 },
		provider.override,
	);

	const outcome = await runReplayConfirmation(dependencies, request);
	const records = await readReplayReps(outcome.repRecordFiles);
	const refs = await readReplayEvidenceRefs(
		records,
		inputs.sourceRoot,
		"confirmation-cleanup",
	);
	const judgeEvidence = await readReplayJudgeEvidence(
		records,
		outcome.repRecordFiles,
	);

	expect(refs).toEqual(
		records.map((record) => {
			const [stage] = record.stages;
			if (stage?.status === "NOT_REACHED" || stage?.evidence === undefined) {
				throw new Error("Expected durable stage evidence");
			}

			return `${stage.evidence.resultSha}\n`;
		}),
	);
	expect(judgeEvidence).toMatchObject([
		{ grade: { verdict: "STOP" } },
		{ attempts: [{ outcome: "REJECTED" }], status: "REJECTED" },
	]);
};

describe(runReplayConfirmation.name, () => {
	describe("durable outcome cleanup", () => {
		it(
			"removes the temporary root after every replay rep completes with durable evidence",
			removesEveryDurablyRecordedWorktree,
		);
		it(
			"retains durable result refs and Judge evidence after cleanup",
			retainsDurableRefsAndJudgeEvidence,
		);
	});
});
