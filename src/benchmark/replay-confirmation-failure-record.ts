import { collectConfirmationMetrics } from "./confirmation-evidence";
import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import type { ProviderCall } from "./contracts";
import { JudgeExecutionError } from "./judge-attempt";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import type { ReplayRepIdentity } from "./replay-confirmation-rep-record";
import type { LiveCorpusRead } from "./stage-live-reads";
import { liveReadsField } from "./stage-live-reads";
import type { StageSessionResult } from "./stage-session-contract";
import StageSessionError from "./stage-session-error";
import type { ProductOwner } from "./workflow";

interface FailedReplayStageInput {
	readonly session: StageSessionResult | undefined;
	readonly productOwner: ProductOwner | undefined;
	readonly stageStart: number;
	readonly now: () => number;
}
function readFailedReplayEvidence(
	failure: Readonly<Error>,
	{ session, productOwner, stageStart, now }: FailedReplayStageInput,
): FailedStageEvidence | undefined {
	if (
		(failure instanceof JudgeExecutionError ||
			failure instanceof JudgeCeilingStopError) &&
		session !== undefined &&
		productOwner !== undefined
	) {
		const productOwnerCalls = productOwner.snapshot().providerCalls;

		return {
			elapsedMs: now() - stageStart,
			productOwnerCalls,
			stageJudgeCalls: failure.providerCalls,
			workerCalls: session.transcript.providerCalls,
		};
	} else if (
		failure instanceof StageSessionError &&
		productOwner !== undefined
	) {
		const productOwnerCalls = productOwner.snapshot().providerCalls;

		return {
			elapsedMs: now() - stageStart,
			productOwnerCalls,
			stageJudgeCalls: [],
			workerCalls: failure.providerCalls,
		};
	}
	return undefined;
}
interface FailedStageEvidence {
	readonly workerCalls: readonly ProviderCall[];
	readonly productOwnerCalls: readonly ProviderCall[];
	readonly stageJudgeCalls: readonly ProviderCall[];
	readonly elapsedMs: number;
}
interface ReplayRepFailure {
	readonly error: string;
	readonly elapsedMs: number;
	readonly stageEvidence?: FailedStageEvidence | undefined;
	readonly liveReads?: readonly LiveCorpusRead[] | undefined;
}
function failedStage(
	rep: ReplayRepIdentity,
	{ error, elapsedMs, stageEvidence, liveReads }: ReplayRepFailure,
): ConfirmationRepRecord["stages"][number] {
	return {
		elapsedMs: stageEvidence?.elapsedMs ?? elapsedMs,
		error,
		...liveReadsField(liveReads),
		stage: rep.request.stage,
		status: "EXECUTION_FAILED",
		worktreePath: rep.worktreePath,
	};
}
function failedRepRecord(
	rep: ReplayRepIdentity,
	failure: ReplayRepFailure,
): ConfirmationRepRecord {
	const { elapsedMs, stageEvidence } = failure;
	const evidence =
		stageEvidence === undefined
			? {
					metrics: {
						calls: [],
						missing: ["stage evidence"],
						status: "MISSING" as const,
					},
					workerTrajectorySteps: 0,
				}
			: collectConfirmationMetrics({
					finalJudge: undefined,
					productOwner: stageEvidence.productOwnerCalls,
					stageJudge: stageEvidence.stageJudgeCalls,
					worker: stageEvidence.workerCalls,
				});

	return confirmationRepRecordSchema.parse({
		caseId: rep.caseId,
		elapsedMs,
		finalOutcome: { status: "NOT_APPLICABLE" },
		groupId: rep.request.groupId,
		lineage: {
			kind: "CHECKPOINT",
			lineage: rep.consumed.lineage,
			targetSha: rep.consumed.targetSha,
		},
		metrics: evidence.metrics,
		mode: "stage",
		ordinal: rep.ordinal,
		outcome: "UNSUCCESSFUL",
		repId: rep.repId,
		schemaVersion: 1,
		stages: [failedStage(rep, failure)],
		workerTrajectorySteps: evidence.workerTrajectorySteps,
		worktreePath: rep.worktreePath,
	});
}
export { failedRepRecord, readFailedReplayEvidence };
export type { FailedStageEvidence };
