import { afterEach, describe, expect, it } from "bun:test";

import type { StageJudgeHooks } from "#benchmark/stage-grading";

import { runGradedStages } from "./run";
import type { JudgeProgress, RunEventKind } from "./run-events";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import type {
	StageEventMetrics,
	StageJudgeExecution,
	StageJudgment,
} from "./run-stage-judge-test-fixtures";
import { fakeRunEventRecorder } from "./test-support";
import type { WorkflowStageRequest } from "./workflow";

const INJECTED_ELAPSED_MS = 500;
const INJECTED_STAGE_EVENT_ELAPSED_MS = 700;
const DELIVERY_CALL_COST_USD = 2.5;
const PLANNING_CALL_COST_USD = 1.5;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedStagesBeforePlanningStarted = 0;

const expectedStagesBeforeBuildStarted = 1;

const expectedSize = 2;

const reading: JudgeProgress = {
	attempt: 1,
	sections: {
		dimensions: { returned: 2, total: 3 },
		hardBlockers: { returned: 1, total: 2 },
		requirements: { returned: 0, total: 1 },
	},
	state: "returning",
};
interface RecordedJudgeProgress {
	readonly stage: string;
	readonly spentUsd: number;
	readonly elapsedMs: number;
	readonly judge: JudgeProgress;
}
function stageSessionCostUsd(stage: string): number {
	return stage === "shape" ? PLANNING_CALL_COST_USD : DELIVERY_CALL_COST_USD;
}
class JudgeProgressRecorder {
	public readonly readings: RecordedJudgeProgress[] = [];
	public readonly recorder: ReturnType<typeof fakeRunEventRecorder> = {
		...fakeRunEventRecorder(),
		recordJudgeProgress: (
			stage: string,
			{ spentUsd, elapsedMs }: StageEventMetrics,
			judge: JudgeProgress,
		) => {
			this.readings.push({ elapsedMs, judge, spentUsd, stage });
		},
	};
}
const recordsBeforeSession = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const executedCountAtEachStart: number[] = [];
	const recorded: {
		readonly kind: RunEventKind;
		readonly stage: string;
		readonly spentUsd: number;
		readonly elapsedMs: number;
	}[] = [];
	const context = {
		...(await new StageContextBuilder().build()),
		elapsedMs: () => INJECTED_ELAPSED_MS,
		runEvents: {
			...fakeRunEventRecorder(),
			record: (
				kind: RunEventKind,
				stage: string,
				{ spentUsd, elapsedMs }: StageEventMetrics,
			) => {
				recorded.push({ elapsedMs, kind, spentUsd, stage });
			},
			recordStageStarted: (
				stage: string,
				{ spentUsd, elapsedMs }: StageEventMetrics,
			) => {
				recorded.push({ elapsedMs, kind: "stage-started", spentUsd, stage });
				executedCountAtEachStart.push(executed.length);
			},
		},
	};

	await runGradedStages(dependencies, context);

	expect(recorded.filter(({ kind }) => kind === "stage-started")).toEqual([
		{ elapsedMs: 500, kind: "stage-started", spentUsd: 0, stage: "shape" },
		{ elapsedMs: 500, kind: "stage-started", spentUsd: 0, stage: "build" },
	]);
	expect(executedCountAtEachStart).toEqual([
		expectedStagesBeforePlanningStarted,
		expectedStagesBeforeBuildStarted,
	]);
};

const identifiesStartedSession = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const sessionsRun: string[] = [];
	const startsRecorded: {
		readonly stage: string;
		readonly sessionId: string;
	}[] = [];
	const context = {
		...(await new StageContextBuilder().build()),
		runEvents: {
			...fakeRunEventRecorder(),
			recordStageStarted: (
				stage: string,
				_metrics: StageEventMetrics,
				sessionId: string,
			) => {
				startsRecorded.push({ sessionId, stage });
			},
		},
	};

	await runGradedStages(
		{
			...dependencies,
			runWorkflowStage: async (request: WorkflowStageRequest) => {
				sessionsRun.push(request.sessionId);

				return await dependencies.runWorkflowStage(request);
			},
		},
		context,
	);

	expect(startsRecorded.map(({ stage }) => stage)).toEqual(["shape", "build"]);
	expect(startsRecorded.map(({ sessionId }) => sessionId)).toEqual(sessionsRun);
	expect(new Set(sessionsRun).size).toBe(expectedSize);
};

const recordsJudgeProgress = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();

	const progress = new JudgeProgressRecorder();
	const reporting = {
		...dependencies,
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
			{ onProgress }: StageJudgeHooks = {},
		) => {
			onProgress?.(reading);

			return await Promise.resolve(scorecardFor(input, "CONTINUE"));
		},
		runWorkflowStage: async (request: WorkflowStageRequest) => ({
			...(await dependencies.runWorkflowStage(request)),
			costUsd: stageSessionCostUsd(request.stage),
		}),
	};
	const context = {
		...(await new StageContextBuilder().build()),
		elapsedMs: () => INJECTED_STAGE_EVENT_ELAPSED_MS,
		runEvents: progress.recorder,
	};

	await runGradedStages(reporting, context);

	expect(progress.readings).toEqual([
		{
			elapsedMs: 700,
			judge: reading,
			spentUsd: 1.5,
			stage: "shape",
		},
		{
			elapsedMs: 700,
			judge: reading,
			spentUsd: 2.5,
			stage: "build",
		},
	]);
};
describe("runGradedStages stage events", () => {
	it(
		"records a stage-started run event for each stage before its session runs, so a monitor can name the stage in flight",
		recordsBeforeSession,
	);

	it(
		"records each stage's start with the id of the session the stage then runs under",
		identifiesStartedSession,
	);

	it(
		"records each progress reading its stage judge reports as a run event of that stage",
		recordsJudgeProgress,
	);
});
