import { afterEach, describe, expect, it } from "bun:test";

import type { JudgeAttempt } from "./judge-attempt";
import { runGradedStages } from "./run";
import {
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	SHA256_HEX_DIGITS,
	stoppedStageDependencies,
} from "./run-stage-dependencies-test-fixture";
import { PLANNING_SKILL_FILES } from "./run-stage-evidence-test-fixtures";
import type {
	StageJudgeExecution,
	StageJudgment,
	StageObservations,
} from "./run-stage-judge-test-fixtures";
import {
	atCeiling,
	stageFailureFixture,
	stoppedStageContext,
} from "./run-stage-spending-test-fixtures";
import { StageQualityError } from "./stage-grade";

const FAILING_JUDGE_ELAPSED_MS = 2500;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const judgeAttempts: readonly JudgeAttempt[] = [
	{
		costUsd: 0.4,
		metrics: {
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			costUsd: 0.4,
			inputTokens: 10,
			outputTokens: 20,
			turns: 1,
		},
		outcome: "ACCEPTED",
		payload: {},
	},
];

const productOwnerCalls = [
	{
		metrics: {
			cacheReadTokens: 3,
			cacheWriteTokens: 4,
			costUsd: 0.75,
			inputTokens: 1,
			outputTokens: 2,
			turns: 1,
		},
	},
];

const paidProductOwner = {
	ask: async () =>
		await Promise.reject(new Error("no product owner in this test")),
	snapshot: () => ({
		providerCalls: productOwnerCalls,
		sessionId: "po",
		spentUsd: 0.75,
	}),
};
const retainsJudgeFindings = async (): Promise<void> => {
	const { dependencies, scorecardFor, persistence, abort } =
		stageFailureFixture();
	const context = { ...(await stoppedStageContext(abort)) };
	const stoppedScorecardCapture: StageObservations = {};
	const failing = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			stoppedScorecardCapture.stoppedScorecard = scorecardFor(input, "STOP");

			return await Promise.resolve(stoppedScorecardCapture.stoppedScorecard);
		},
	};

	const outcome = runGradedStages(failing, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);

	await abort.markAborted("shape stage graded F; minimum grade is B");

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		corpusFiles: PLANNING_SKILL_FILES,
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		dimensions: stoppedScorecardCapture.stoppedScorecard?.grade.dimensions,
		hardBlockers: stoppedScorecardCapture.stoppedScorecard?.grade.hardBlockers,
		requirements: stoppedScorecardCapture.stoppedScorecard?.grade.requirements,
		status: "STAGE_JUDGE_FAILED",
		summary: stoppedScorecardCapture.stoppedScorecard?.grade.summary,
	});
};

const retainsStoppedReadings = async (): Promise<void> => {
	const { dependencies, scorecardFor, persistence, abort } =
		stageFailureFixture();

	let runClockMs = 5000;
	const context = {
		...(await stoppedStageContext(abort)),
		elapsedMs: () => runClockMs,
		minimumStageGrade: "C" as const,
		productOwner: paidProductOwner,
	};
	const failing = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			runClockMs += FAILING_JUDGE_ELAPSED_MS;

			return await Promise.resolve({
				...scorecardFor(input, "STOP"),
				attempts: judgeAttempts,
			});
		},
	};

	const stopped = runGradedStages(failing, context);

	expect(stopped).rejects.toBeInstanceOf(StageQualityError);
	await Promise.allSettled([stopped]);

	await abort.markAborted("shape stage graded F; minimum grade is C");

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		attempts: judgeAttempts,
		elapsedMs: 2500,
		grade: { grade: "F", verdict: "STOP" },
		minimumGrade: "C",
		productOwnerCostUsd: 0.75,
		productOwnerProviderCalls: productOwnerCalls,
		runElapsedMs: 7500,
		status: "STAGE_JUDGE_FAILED",
	});
};

const recordsRaisedMinimum = async (): Promise<void> => {
	const { dependencies, scorecardFor, persistence, abort } =
		stageFailureFixture();
	const context = {
		...(await stoppedStageContext(abort)),
		minimumStageGrade: "A" as const,
	};
	const passingB = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => await Promise.resolve(scorecardFor(input, "CONTINUE")),
	};

	const stopped = runGradedStages(passingB, context);

	expect(stopped).rejects.toBeInstanceOf(StageQualityError);
	await Promise.allSettled([stopped]);

	await abort.markAborted("shape stage graded B; minimum grade is A");

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		grade: { grade: "B", verdict: "CONTINUE" },
		minimumGrade: "A",
		status: "STAGE_JUDGE_FAILED",
	});
};

const recordsSessionSettings = async (): Promise<void> => {
	const { dependencies } = stoppedStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await stoppedStageContext(abort)),
		effort: "high" as const,
		judgeEffort: "low" as const,
		judgeModel: "claude-3-7-sonnet-20250219",
		model: "claude-3-5-sonnet-20241022",
		sessionBudgetUsd: 12,
	};

	const outcome = runGradedStages(dependencies, context);

	expect(outcome).rejects.toThrow("minimum grade is B");
	await Promise.allSettled([outcome]);

	await abort.markAborted("shape stage graded F; minimum grade is B");

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		effort: "high",
		judgeEffort: "low",
		judgeModel: "claude-3-7-sonnet-20250219",
		model: "claude-3-5-sonnet-20241022",
		sessionBudgetUsd: 12,
		status: "STAGE_JUDGE_FAILED",
	});
};
describe("runGradedStages stopped artifacts", () => {
	it(
		"keeps the judge's findings, captured corpus files and corpus version in the aborted stage artifact after a normal grade failure",
		retainsJudgeFindings,
	);

	it(
		"keeps the stopped grade, minimum grade, judge attempts, elapsed times and Product Owner spend in the aborted stage artifact",
		retainsStoppedReadings,
	);

	it(
		"stops at a raised minimum grade with a stop record, though the judge's verdict is CONTINUE",
		recordsRaisedMinimum,
	);

	it(
		"records workflow model, judge model, effort settings, and budget in the aborted stage artifact when judgment fails",
		recordsSessionSettings,
	);
});
