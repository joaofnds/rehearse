import { describe, expect, it } from "bun:test";

import type { WorkflowStageRequest } from "#benchmark/workflow";

import type { StageJudgeInput } from "./contracts";
import type { JudgeAttempt, JudgeBudget } from "./judge-attempt";
import { readReplayRecord, runReplay } from "./replay";
import { replayScorecard } from "./replay-confirmation-stage-test-harness";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import ReplaySavedRunBuilder from "./replay-saved-run-test-builder";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { TestResources } from "./test-support";

const FIRST_REPLAY_ELAPSED_MS = 3000;
const LATER_REPLAY_ELAPSED_MS = 2000;
interface StageJudgeExecution {
	readonly model: string | undefined;
	readonly effort: undefined | "low" | "medium" | "high" | "xhigh" | "max";
	readonly budget: JudgeBudget;
}
interface StageJudgment {
	readonly input: StageJudgeInput;
}

const testResources = TestResources.forEachTest();
const recordsTheSpendCeilingTheReplayRanUnder = async (): Promise<void> => {
	const expectedSpendCeilingUsd = 12;

	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();

	const outcome = await runReplay(fake.dependencies, {
		...new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		spendCeilingUsd: 12,
	});

	const record = await readReplayRecord(outcome.recordPath);

	expect(record.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
};
const retainsTheStageScorecardsJudgeAttempts = async (): Promise<void> => {
	const run = await new ReplaySavedRunBuilder().build(testResources);
	const fake = new ReplayConfirmationHarness();
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.5,
			outcome: "ACCEPTED",
			payload: { summary: "accepted replay" },
		},
	];
	const recording = {
		...fake.dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) =>
			await Promise.resolve({
				...replayScorecard(input),
				attempts,
			}),
	};

	const outcome = await runReplay(
		recording,
		new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
	);
	const record = await readReplayRecord(outcome.recordPath);

	expect(record.scorecard["attempts"]).toEqual(attempts);
};
const recordsTheReplayedStagesElapsedTimeFromItsSession =
	async (): Promise<void> => {
		const expectedElapsedMs = 5000;

		const run = await new ReplaySavedRunBuilder().build(testResources);
		const fake = new ReplayConfirmationHarness();
		let clockMs = 1000;
		const timed = {
			...fake.dependencies,
			now: () => clockMs,
			runStageJudge: async (
				_execution: StageJudgeExecution,
				{ input }: StageJudgment,
			) => {
				clockMs += FIRST_REPLAY_ELAPSED_MS;

				return await Promise.resolve(replayScorecard(input));
			},
			stageSession: {
				...fake.dependencies.stageSession,
				runWorkflowStage: async (input: WorkflowStageRequest) => {
					clockMs += LATER_REPLAY_ELAPSED_MS;

					return await fake.dependencies.stageSession.runWorkflowStage(input);
				},
			},
		};

		const outcome = await runReplay(
			timed,
			new ReplayRequestBuilder({ stage: "build" }).build(run.paths),
		);
		const record = await readReplayRecord(outcome.recordPath);

		expect(record.elapsedMs).toBe(expectedElapsedMs);
	};
describe(runReplay.name, () => {
	describe("cost and timing evidence", () => {
		it(
			"records the spend ceiling the replay ran under",
			recordsTheSpendCeilingTheReplayRanUnder,
		);
		it(
			"retains the stage scorecard's Judge attempts",
			retainsTheStageScorecardsJudgeAttempts,
		);
		it(
			"records the replayed stage's elapsed time, from its session to its judge's grade",
			recordsTheReplayedStagesElapsedTimeFromItsSession,
		);
	});
});
