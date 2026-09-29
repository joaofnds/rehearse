import type { StageSkillPresence } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import type { ConfirmationConfig } from "./config";
import { projectConfirmationCost, runRequestedExecution } from "./confirmation";
import type { ReplayRequest } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation";

export type ReplayStageOutcome<DebugEvidence, ConfirmationEvidence> =
	| { readonly kind: "debug"; readonly evidence: DebugEvidence }
	| { readonly kind: "confirmation"; readonly evidence: ConfirmationEvidence };

export interface ReplayStageExecutionDependencies<
	DebugEvidence,
	ConfirmationEvidence,
> {
	readonly approval: {
		readonly output: (message: string) => void;
		readonly prompt: (message: string) => Promise<string>;
	};
	readonly runDebug: (request: ReplayRequest) => Promise<DebugEvidence>;
	readonly runConfirmed: (
		request: ReplayConfirmationRequest,
	) => Promise<ConfirmationEvidence>;
	readonly groupId: () => string;
	readonly corpusRoots: readonly CorpusRoot[];
}

export function executeReplayStage<DebugEvidence, ConfirmationEvidence>(
	config: {
		readonly confirmation?: ConfirmationConfig | undefined;
		readonly stageSkill: StageSkillPresence;
	},
	request: ReplayRequest,
	dependencies: ReplayStageExecutionDependencies<
		DebugEvidence,
		ConfirmationEvidence
	>,
): Promise<ReplayStageOutcome<DebugEvidence, ConfirmationEvidence>> {
	const { confirmation } = config;

	return runRequestedExecution<
		ReplayStageOutcome<DebugEvidence, ConfirmationEvidence>
	>({
		confirmation,
		projectCost: () =>
			projectConfirmationCost({
				mode: "stage",
				reps: confirmation?.reps ?? 1,
				sessionBudgetUsd: request.sessionBudgetUsd,
			}),
		approval: dependencies.approval,
		runDebug: async () => ({
			kind: "debug" as const,
			evidence: await dependencies.runDebug(request),
		}),
		runConfirmed: async (projectedCost) => {
			if (confirmation === undefined) {
				throw new Error("Confirmation configuration is required");
			}

			return {
				kind: "confirmation" as const,
				evidence: await dependencies.runConfirmed({
					...request,
					groupId: dependencies.groupId(),
					reps: confirmation.reps,
					corpusRoots: dependencies.corpusRoots,
					projectedCost,
					approvalMethod: confirmation.approval,
					stageSkill: config.stageSkill,
				}),
			};
		},
	});
}
