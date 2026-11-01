import { afterEach, describe, expect, it } from "bun:test";

import type { JudgeAttempt } from "./judge-attempt";
import { JudgeOutputValidationError } from "./judge-attempt";
import { STAGE_JUDGE_CONTRACT_SHA256 } from "./judge-contract";
import { runGradedStages } from "./run";
import type { PendingStage } from "./run-abort";
import {
	StageContextBuilder,
	noCalibration,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	fakeStageDependencies,
	stoppedStageDependencies,
} from "./run-stage-dependencies-test-fixture";

const FINAL_PENDING_STAGE_OFFSET = -1;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const retainsValidationFailure = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.1,
			error: "invalid evidence",
			outcome: "REJECTED",
			payload: { summary: "invalid" },
		},
	];
	const failure = new JudgeOutputValidationError({
		attempts,
		costUsd: 0.1,
		judgeContractSha256: STAGE_JUDGE_CONTRACT_SHA256,
		message: "invalid evidence",
		prompt: "original prompt",
	});
	const pendingStages: (PendingStage | undefined)[] = [];
	const context = {
		...(await new StageContextBuilder().build()),
		updatePendingStage: (pending: PendingStage) => {
			pendingStages.push(pending);
		},
	};
	const failing = {
		...dependencies,
		runStageJudge: async () => await Promise.reject(failure),
	};

	expect(runGradedStages(failing, context)).rejects.toBe(failure);

	expect(pendingStages.at(FINAL_PENDING_STAGE_OFFSET)?.failure).toEqual({
		attempts,
		costUsd: 0.1,
		judgeContractSha256: STAGE_JUDGE_CONTRACT_SHA256,
		judgeProviderCalls: [{}],
		prompt: "original prompt",
	});
};

const retainsFailedScorecard = async (): Promise<void> => {
	const { dependencies } = stoppedStageDependencies();
	const pendingStages: (PendingStage | undefined)[] = [];
	const context = {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: noCalibration,
		updatePendingStage: (pending: PendingStage) => {
			pendingStages.push(pending);
		},
	};

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);

	expect(
		pendingStages.at(FINAL_PENDING_STAGE_OFFSET)?.scorecard?.grade.verdict,
	).toBe("STOP");
};
describe("runGradedStages rejected judge evidence", () => {
	it(
		"retains exhausted validation evidence on the pending stage",
		retainsValidationFailure,
	);

	it(
		"retains the stopped scorecard on the pending stage for a normal grade failure",
		retainsFailedScorecard,
	);
});
