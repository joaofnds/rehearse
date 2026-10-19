import type { ConfirmationRepResult } from "./confirmation-evidence";
import { finalizeConfirmationGroup } from "./confirmation-evidence";
import type { ConfirmationGroupFinalization } from "./confirmation-group-finalization-contract";
import type {
	ReplayConfirmationOutcome,
	ReplayConfirmationRequest,
} from "./replay-confirmation-contract";
import type { ReplayConfirmationRuntime } from "./replay-confirmation-runtime";

interface ReplayGroupReadings {
	readonly makespanMs: number;
	readonly repResults: readonly ConfirmationRepResult[];
	readonly startedAt: string;
}
type ReplayGroupInputs = Extract<
	ConfirmationGroupFinalization,
	{ readonly mode: "stage" | "pipeline" }
>["inputs"];
function replayGroupInputs(
	request: ReplayConfirmationRequest,
	frozen: ReplayConfirmationRuntime["frozen"],
): ReplayGroupInputs {
	return {
		corpusVersion: frozen.corpusVersion,
		effort: request.effort,
		files: frozen.files,
		judgeEffort: request.judgeEffort,
		judgeModel: request.judgeModel,
		lineage: {
			kind: "CHECKPOINT",
			lineage: frozen.plan.consumed.lineage,
			targetSha: frozen.plan.consumed.targetSha,
		},
		model: request.model,
		pipelinePath: frozen.manifest.pipelinePath,
		sessionBudgetUsd: request.sessionBudgetUsd,
		spendCeilingUsd: request.spendCeilingUsd,
	};
}
async function finishReplayConfirmation(
	request: ReplayConfirmationRequest,
	{ paths, frozen, worktreesDirectory }: ReplayConfirmationRuntime,
	{ makespanMs, repResults, startedAt }: ReplayGroupReadings,
): Promise<ReplayConfirmationOutcome> {
	return await finalizeConfirmationGroup({
		approvalMethod: request.approvalMethod,
		caseId: frozen.manifest.caseId,
		declaredStages: [request.stage],
		groupDirectory: paths.directory,
		groupFile: paths.groupFile,
		groupId: request.groupId,
		inputs: replayGroupInputs(request, frozen),
		makespanMs,
		mode: "stage",
		operatorStopFile: paths.operatorStopFile,
		projectedCost: request.projectedCost,
		repResults,
		reportFile: paths.reportFile,
		reps: request.reps,
		runsDirectory: request.paths.runsDirectory,
		startedAt,
		worktreesDirectory,
	});
}
export default finishReplayConfirmation;
