import { describe, expect, it } from "bun:test";
import { dirname } from "node:path";

import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import runPipelineConfirmation from "./pipeline-confirmation";
import { failFirstWorkerInvocation } from "./pipeline-confirmation-failure-test-fixtures";
import { readReps } from "./pipeline-confirmation-record-test-reader";
import {
	CONFIRMATION_METRIC,
	PipelineConfirmationHarness,
} from "./pipeline-confirmation-test-support";
import StageSessionError from "./stage-session-error";
import { removeWorktree } from "./target";
import { TestResources } from "./test-support";

const INITIAL_REP_ORDINAL = 1;

const FIRST_RECORDED_STAGE_INDEX = 0;

const testResources = TestResources.forEachTest();

function parseConfirmationRepRecord(text: string): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}

function repOrdinal(targetDirectory: string): number {
	const match = /-rep-(?<ordinal>\d+)$/u.exec(targetDirectory);

	return Number(match?.groups?.["ordinal"]);
}

async function retainsEarlierPipelineWorkerMetricsWhenALaterStageOmitsThem(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "pipeline-metrics",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		(dependencies) => {
			const { stageSession } = dependencies;
			const { runWorkflowStage } = stageSession;

			return {
				...dependencies,
				stageSession: {
					...stageSession,
					runWorkflowStage: async (request) => {
						const result = await runWorkflowStage(request);
						if (request.stage === "discuss") {
							return result;
						}

						return { ...result, providerCalls: [{}] };
					},
				},
			};
		},
	);
	const [recordFile] = outcome.repRecordFiles;
	const record = parseConfirmationRepRecord(
		await Bun.file(recordFile ?? "missing").text(),
	);

	expect(record.metrics).toEqual({
		calls: [
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "final-judge" },
		],
		missing: ["worker call metrics"],
		status: "MISSING",
	});
	expect(record.workerTrajectorySteps).toBe(CONFIRMATION_METRIC.turns);
}

async function retainsWorkerCallsCarriedByAFailedStageExecution(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "worker-execution-metrics",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		failFirstWorkerInvocation,
	);
	const records = await readReps(outcome);
	const [failed] = records;
	testResources.track(dirname(failed?.worktreePath ?? "missing"));
	await removeWorktree(harness.sourceRoot, failed?.worktreePath ?? "missing");

	expect(failed?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "Worker execution failed: worker invocation failed",
		status: "EXECUTION_FAILED",
	});
	expect(failed?.metrics).toEqual({
		calls: [{ metrics: CONFIRMATION_METRIC, role: "worker" }],
		missing: ["worker call metrics", "stage-judge call metrics"],
		status: "MISSING",
	});
	expect(failed?.workerTrajectorySteps).toBe(CONFIRMATION_METRIC.turns);
}

async function retainsAReturnedSessionSWorkerCallsWhenAStepAfterItFails(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "post-session-metrics",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		(dependencies) => {
			const { stageSession } = dependencies;
			const { readTaskOutput } = stageSession;

			return {
				...dependencies,
				stageSession: {
					...stageSession,
					readTaskOutput: async (targetDir, taskId) =>
						await (repOrdinal(targetDir) === INITIAL_REP_ORDINAL
							? Promise.reject(new Error("backlog is gone"))
							: readTaskOutput(targetDir, taskId)),
				},
			};
		},
	);
	const records = await readReps(outcome);
	const [failed] = records;
	testResources.track(dirname(failed?.worktreePath ?? "missing"));
	await removeWorktree(harness.sourceRoot, failed?.worktreePath ?? "missing");

	expect(failed?.stages[FIRST_RECORDED_STAGE_INDEX]).toMatchObject({
		error: "backlog is gone",
		status: "EXECUTION_FAILED",
	});
	expect(failed?.metrics).toEqual({
		calls: [{ metrics: CONFIRMATION_METRIC, role: "worker" }],
		missing: ["stage-judge call metrics"],
		status: "MISSING",
	});
}

async function retainsWorkerCallsCarriedByAStageThatFailedAfterItsFirstCall(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run(
		{
			groupId: "stage-session-metrics",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 2,
				totalMaximumUsd: 90,
			},
			reps: 2,
		},
		(dependencies) => {
			const { stageSession } = dependencies;
			const { runWorkflowStage } = stageSession;

			return {
				...dependencies,
				stageSession: {
					...stageSession,
					runWorkflowStage: async (request) => {
						if (
							request.stage === "discuss" &&
							repOrdinal(request.targetDir) === INITIAL_REP_ORDINAL
						) {
							throw new StageSessionError({
								cause: new Error("Reached maximum budget"),
								costUsd: CONFIRMATION_METRIC.costUsd,
								providerCalls: [{ metrics: CONFIRMATION_METRIC }],
							});
						}

						return await runWorkflowStage(request);
					},
				},
			};
		},
	);
	const records = await readReps(outcome);
	const [failed] = records;
	testResources.track(dirname(failed?.worktreePath ?? "missing"));
	await removeWorktree(harness.sourceRoot, failed?.worktreePath ?? "missing");

	expect(failed?.metrics).toMatchObject({
		calls: [{ metrics: CONFIRMATION_METRIC, role: "worker" }],
	});
}

async function carriesProductOwnerProviderCallsIntoPipelineEvidence(): Promise<void> {
	const harness = await PipelineConfirmationHarness.setup(testResources);

	const outcome = await harness.run({}, (dependencies) => ({
		...dependencies,
		createProductOwner: () => ({
			ask: async () => await Promise.resolve("Use the small scope"),
			snapshot: () => ({
				providerCalls: [{ metrics: CONFIRMATION_METRIC }, {}],
				sessionId: "po-session",
				spentUsd: CONFIRMATION_METRIC.costUsd,
			}),
		}),
	}));
	const [recordFile] = outcome.repRecordFiles;
	const record = parseConfirmationRepRecord(
		await Bun.file(recordFile ?? "missing").text(),
	);

	expect(record.metrics).toEqual({
		calls: [
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "worker" },
			{ metrics: CONFIRMATION_METRIC, role: "product-owner" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "stage-judge" },
			{ metrics: CONFIRMATION_METRIC, role: "final-judge" },
		],
		missing: ["product-owner call metrics"],
		status: "MISSING",
	});
}

describe(runPipelineConfirmation.name, () => {
	describe("when worker or Product Owner calls return incomplete metrics", () => {
		it(
			"retains earlier pipeline worker metrics when a later stage omits them",
			retainsEarlierPipelineWorkerMetricsWhenALaterStageOmitsThem,
		);
		it(
			"retains worker calls carried by a failed stage execution",
			retainsWorkerCallsCarriedByAFailedStageExecution,
		);
		it(
			"retains a returned session's worker calls when a step after it fails",
			retainsAReturnedSessionSWorkerCallsWhenAStepAfterItFails,
		);
		it(
			"retains worker calls carried by a stage that failed after its first call",
			retainsWorkerCallsCarriedByAStageThatFailedAfterItsFirstCall,
		);
		it(
			"carries Product Owner provider calls into pipeline evidence",
			carriesProductOwnerProviderCallsIntoPipelineEvidence,
		);
	});
});
