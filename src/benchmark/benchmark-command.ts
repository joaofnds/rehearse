import type { ApprovalMethod, BenchmarkConfig } from "./config";
import { projectConfirmationCost, runRequestedExecution } from "./confirmation";
import type { ConfirmationCostProjection } from "./confirmation";

const SINGLE_EXECUTION_REP_COUNT = 1;

interface BenchmarkConfirmationExecution {
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection;
	readonly approvalMethod: ApprovalMethod;
}

type BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence> =
	| { readonly kind: "debug"; readonly evidence: DebugEvidence }
	| { readonly kind: "confirmation"; readonly evidence: ConfirmationEvidence };

interface BenchmarkExecutionRequest {
	readonly stageCount: number;
	readonly spendCeilingUsd: number;
}

interface BenchmarkExecutionDependencies<DebugEvidence, ConfirmationEvidence> {
	readonly approval: {
		readonly output: (message: string) => void;
		readonly prompt: (message: string) => Promise<string>;
	};
	readonly runDebug: () => Promise<DebugEvidence>;
	readonly runConfirmed: (
		request: BenchmarkConfirmationExecution,
	) => Promise<ConfirmationEvidence>;
}

async function executeBenchmark<DebugEvidence, ConfirmationEvidence>(
	config: BenchmarkConfig,
	request: BenchmarkExecutionRequest,
	dependencies: BenchmarkExecutionDependencies<
		DebugEvidence,
		ConfirmationEvidence
	>,
): Promise<BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence>> {
	const { confirmation } = config;

	return await runRequestedExecution<
		BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence>
	>({
		approval: dependencies.approval,
		confirmation,
		projectCost: (spendCeilingUsd) =>
			projectConfirmationCost({
				mode: "pipeline",
				reps: confirmation?.reps ?? SINGLE_EXECUTION_REP_COUNT,
				sessionBudgetUsd: config.sessionBudgetUsd,
				spendCeilingUsd,
				stages: request.stageCount,
			}),
		runConfirmed: async (projectedCost) => {
			if (confirmation === undefined) {
				throw new Error("Confirmation configuration is required");
			}

			return {
				evidence: await dependencies.runConfirmed({
					approvalMethod: confirmation.approval,
					projectedCost,
					reps: confirmation.reps,
				}),
				kind: "confirmation" as const,
			};
		},
		runDebug: async () => ({
			evidence: await dependencies.runDebug(),
			kind: "debug" as const,
		}),
		spendCeilingUsd: request.spendCeilingUsd,
	});
}

export { executeBenchmark as default };
export type {
	BenchmarkConfirmationExecution,
	BenchmarkExecutionOutcome,
	BenchmarkExecutionRequest,
	BenchmarkExecutionDependencies,
};
