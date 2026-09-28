import type { ApprovalMethod, BenchmarkConfig } from "./config";
import { projectConfirmationCost, runRequestedExecution } from "./confirmation";
import type { ConfirmationCostProjection } from "./confirmation";

export interface BenchmarkConfirmationExecution {
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection;
	readonly approvalMethod: ApprovalMethod;
}

export type BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence> =
	| { readonly kind: "debug"; readonly evidence: DebugEvidence }
	| { readonly kind: "confirmation"; readonly evidence: ConfirmationEvidence };

export interface BenchmarkExecutionDependencies<
	DebugEvidence,
	ConfirmationEvidence,
> {
	readonly approval: {
		readonly output: (message: string) => void;
		readonly prompt: (message: string) => Promise<string>;
	};
	readonly runDebug: () => Promise<DebugEvidence>;
	readonly runConfirmed: (
		request: BenchmarkConfirmationExecution,
	) => Promise<ConfirmationEvidence>;
}

export function executeBenchmark<DebugEvidence, ConfirmationEvidence>(
	config: BenchmarkConfig,
	stageCount: number,
	dependencies: BenchmarkExecutionDependencies<
		DebugEvidence,
		ConfirmationEvidence
	>,
): Promise<BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence>> {
	const { confirmation } = config;

	return runRequestedExecution<
		BenchmarkExecutionOutcome<DebugEvidence, ConfirmationEvidence>
	>({
		confirmation,
		projectCost: () =>
			projectConfirmationCost({
				mode: "pipeline",
				reps: confirmation?.reps ?? 1,
				stages: stageCount,
				sessionBudgetUsd: config.sessionBudgetUsd,
			}),
		approval: dependencies.approval,
		runDebug: async () => ({
			kind: "debug" as const,
			evidence: await dependencies.runDebug(),
		}),
		runConfirmed: async (projectedCost) => {
			if (confirmation === undefined) {
				throw new Error("Confirmation configuration is required");
			}

			return {
				kind: "confirmation" as const,
				evidence: await dependencies.runConfirmed({
					reps: confirmation.reps,
					projectedCost,
					approvalMethod: confirmation.approval,
				}),
			};
		},
	});
}
