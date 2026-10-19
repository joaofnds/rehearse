import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import type { JudgeAttempt } from "./judge-attempt";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	SHA256_HEX_DIGITS,
	fakeStageDependencies,
	stageFixture,
} from "./run-stage-dependencies-test-fixture";
import {
	PLANNING_SKILL_FILES,
	readStageRecord,
} from "./run-stage-evidence-test-fixtures";
import type {
	StageJudgeExecution,
	StageJudgment,
	StageObservations,
} from "./run-stage-judge-test-fixtures";
import { atCeiling } from "./run-stage-spending-test-fixtures";
import type { WorkflowStageRequest } from "./workflow";

const JUDGE_ELAPSED_MS = 200;
const DELIVERY_SESSION_ELAPSED_MS = 3000;
const PLANNING_SESSION_ELAPSED_MS = 1000;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const corpusFilesSchema = z.array(
	z.object({ path: z.string(), sha256: z.string() }),
);

const inputSchema = z.object({ commitSubjects: z.array(z.string()) });
const sessionInputsRecordSchema = z.object({
	corpusFiles: corpusFilesSchema,
	corpusVersion: z.object({ digest: z.string(), kind: z.string() }),
	effort: z.string(),
	model: z.string(),
});

const pendingCommitSubjectsSchema = z.object({
	input: inputSchema,
});

const completedCommitSubjectsSchema = z.object({ input: inputSchema });

const judgeAttemptsRecordSchema = z.record(z.string(), z.json());
const recordsSessionInputs = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		effort: "high" as const,
		model: "opus",
	};

	await runGradedStages(dependencies, context);

	const stageRecord = await readStageRecord(
		context,
		"shape",
		sessionInputsRecordSchema,
	);

	expect(stageRecord).toEqual({
		corpusFiles: PLANNING_SKILL_FILES,
		corpusVersion: { digest: "c".repeat(SHA256_HEX_DIGITS), kind: "version" },
		effort: "high",
		model: "opus",
	});
};

const recordsStageElapsedTime = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	let runClockMs = 0;
	const timed = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			runClockMs += JUDGE_ELAPSED_MS;

			return await Promise.resolve(scorecardFor(input, "CONTINUE"));
		},
		runWorkflowStage: async (request: WorkflowStageRequest) => {
			runClockMs +=
				request.stage === "shape"
					? PLANNING_SESSION_ELAPSED_MS
					: DELIVERY_SESSION_ELAPSED_MS;

			return await dependencies.runWorkflowStage(request);
		},
	};
	const context = {
		...(await new StageContextBuilder().build()),
		elapsedMs: () => runClockMs,
	};

	await runGradedStages(timed, context);

	const elapsed = z.object({ elapsedMs: z.number() });

	const stageRecord = await readStageRecord(context, "shape", elapsed);

	expect(stageRecord).toEqual({ elapsedMs: 1200 });

	const buildElapsedRecord = await readStageRecord(context, "build", elapsed);
	expect(buildElapsedRecord).toEqual({ elapsedMs: 3200 });
};

const persistsThroughTransitions = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await new StageContextBuilder().build()),
		completeStage: abort.completeStage,
		writePendingStage: abort.writePendingStage,
	};

	await runGradedStages(dependencies, context);

	const stageRecord: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);

	expect(stageRecord).toMatchObject({
		grade: { verdict: "CONTINUE" },
		model: "sonnet",
	});
};

const retainsCommitSubjects = async (): Promise<void> => {
	const { dependencies, scorecardFor, context } = await stageFixture();
	const awaitingSubjectsCapture: StageObservations = {};
	const recording = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) => {
			if (input.stage === "build") {
				const pending = await readStageRecord(
					context,
					input.stage,
					pendingCommitSubjectsSchema,
				);
				awaitingSubjectsCapture.awaitingSubjects = pending.input.commitSubjects;
			}

			return scorecardFor(input, "CONTINUE");
		},
	};

	await runGradedStages(recording, context);

	const completed = await readStageRecord(
		context,
		"build",
		completedCommitSubjectsSchema,
	);

	expect(awaitingSubjectsCapture.awaitingSubjects).toEqual(["build commit"]);
	expect(completed.input.commitSubjects).toEqual(["build commit"]);
};

const recordsJudgeAttempts = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.4,
			outcome: "ACCEPTED",
			payload: { summary: "accepted" },
		},
	];
	const context = await new StageContextBuilder().build();
	const recording = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) =>
			await Promise.resolve({
				...scorecardFor(input, "CONTINUE"),
				attempts,
				costUsd: 0.4,
			}),
	};

	await runGradedStages(recording, context);

	const record: unknown = await readStageRecord(
		context,
		"shape",
		judgeAttemptsRecordSchema,
	);

	expect(record).toMatchObject({ attempts, costUsd: 0.4 });
};
describe("runGradedStages stage records", () => {
	it(
		"records the stage session inputs beside a continued scorecard",
		recordsSessionInputs,
	);

	it(
		"records each stage's elapsed time on its stage record, from the run clock",
		recordsStageElapsedTime,
	);

	it(
		"persists stage records through the run transition boundary",
		persistsThroughTransitions,
	);

	it(
		"retains commit subjects in awaiting and completed stage records",
		retainsCommitSubjects,
	);

	it(
		"records Judge attempts beside a continued scorecard",
		recordsJudgeAttempts,
	);
});
