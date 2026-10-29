import type { ConfirmationConfig, StageSkillPresence } from "./config";
import { projectConfirmationCost, runRequestedExecution } from "./confirmation";
import type { CorpusRoot } from "./corpus-file";
import type { ReplayRequest } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation";

const SINGLE_EXECUTION_REP_COUNT = 1;

type ReplayStageOutcome<DebugEvidence, ConfirmationEvidence> =
	| { readonly kind: "debug"; readonly evidence: DebugEvidence }
	| { readonly kind: "confirmation"; readonly evidence: ConfirmationEvidence };

interface ReplayStageExecutionDependencies<
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

async function executeReplayStage<DebugEvidence, ConfirmationEvidence>(
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

	return await runRequestedExecution<
		ReplayStageOutcome<DebugEvidence, ConfirmationEvidence>
	>({
		approval: dependencies.approval,
		confirmation,
		projectCost: (spendCeilingUsd) =>
			projectConfirmationCost({
				mode: "stage",
				reps: confirmation?.reps ?? SINGLE_EXECUTION_REP_COUNT,
				sessionBudgetUsd: request.sessionBudgetUsd,
				spendCeilingUsd,
			}),
		runConfirmed: async (projectedCost) => {
			if (confirmation === undefined) {
				throw new Error("Confirmation configuration is required");
			}

			return {
				evidence: await dependencies.runConfirmed({
					...request,
					approvalMethod: confirmation.approval,
					corpusRoots: dependencies.corpusRoots,
					groupId: dependencies.groupId(),
					projectedCost,
					reps: confirmation.reps,
					stageSkill: config.stageSkill,
				}),
				kind: "confirmation" as const,
			};
		},
		runDebug: async () => ({
			evidence: await dependencies.runDebug(request),
			kind: "debug" as const,
		}),
		spendCeilingUsd: request.spendCeilingUsd,
	});
}

export { executeReplayStage as default };
export type { ReplayStageOutcome, ReplayStageExecutionDependencies };
