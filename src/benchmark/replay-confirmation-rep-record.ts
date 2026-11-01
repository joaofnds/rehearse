import type { CheckpointRecord } from "./checkpoint";
import { collectConfirmationMetrics } from "./confirmation-evidence";
import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import type { Immutable, ProviderCall, StageScorecard } from "./contracts";
import type { LiveCorpusRead } from "./live-corpus-reads";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import { liveReadsField } from "./stage-live-reads";

const RECORD_JSON_INDENT_SPACES = 2;

interface JudgeRejection {
	readonly message: string;
	readonly prompt: string;
	readonly judgeContractSha256?: string | undefined;
	readonly attempts: readonly ProviderCall[];
	readonly costUsd: number;
}

/**
 * What every rep record of one replay group shares. The case is the one the
 * replayed run recorded, read from its manifest rather than taken from the
 * replay's own flags, because a replay reruns that run's case by definition.
 */
interface ReplayRepIdentity {
	readonly request: ReplayConfirmationRequest;
	readonly caseId: string;
	readonly consumed: Pick<CheckpointRecord, "lineage" | "targetSha">;
	readonly repId: string;
	readonly ordinal: number;
	readonly worktreePath: string;
}

interface CompletedReplayResult {
	readonly liveReads: readonly LiveCorpusRead[] | undefined;
	readonly resultSha: string;
	readonly scorecardFile: string;
	readonly scorecard: StageScorecard;
}

interface ReplayRepUsage {
	readonly workerCalls: readonly ProviderCall[];
	readonly productOwnerCalls: readonly ProviderCall[];
	readonly stageElapsedMs: number;
	readonly repElapsedMs: number;
}

function judgedStage(
	rep: ReplayRepIdentity,
	result: CompletedReplayResult,
	usage: ReplayRepUsage,
): Immutable<ConfirmationRepRecord["stages"][number]> {
	return {
		elapsedMs: usage.stageElapsedMs,
		evidence: {
			recordFile: result.scorecardFile,
			resultSha: result.resultSha,
		},
		grade: result.scorecard.grade.grade,
		judgeContractSha256: result.scorecard.judgeContractSha256,
		...liveReadsField(result.liveReads),
		stage: rep.request.stage,
		status: "JUDGED",
		verdict: result.scorecard.grade.verdict,
	};
}

function completeRepRecord(
	rep: ReplayRepIdentity,
	result: CompletedReplayResult,
	usage: ReplayRepUsage,
): Immutable<ConfirmationRepRecord> {
	const evidence = collectConfirmationMetrics({
		finalJudge: undefined,
		productOwner: usage.productOwnerCalls,
		stageJudge: result.scorecard.attempts,
		worker: usage.workerCalls,
	});
	const successful =
		evidence.metrics.status === "COMPLETE" &&
		result.scorecard.grade.verdict === "CONTINUE" &&
		(result.scorecard.grade.grade === "A" ||
			result.scorecard.grade.grade === "B");

	return confirmationRepRecordSchema.parse({
		caseId: rep.caseId,
		elapsedMs: usage.repElapsedMs,
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
		outcome: successful ? "SUCCESSFUL" : "UNSUCCESSFUL",
		repId: rep.repId,
		schemaVersion: 1,
		stages: [judgedStage(rep, result, usage)],
		workerTrajectorySteps: evidence.workerTrajectorySteps,
		worktreePath: rep.worktreePath,
	});
}

interface RejectedReplayResult {
	readonly liveReads: readonly LiveCorpusRead[] | undefined;
	readonly resultSha: string;
	readonly recordFile: string;
	readonly error: JudgeRejection;
}

function rejectedJudgeRepRecord(
	rep: ReplayRepIdentity,
	{ liveReads, resultSha, recordFile, error }: RejectedReplayResult,
	{
		workerCalls,
		productOwnerCalls,
		stageElapsedMs,
		repElapsedMs,
	}: ReplayRepUsage,
): Immutable<ConfirmationRepRecord> {
	const evidence = collectConfirmationMetrics({
		finalJudge: undefined,
		productOwner: productOwnerCalls,
		stageJudge: error.attempts,
		worker: workerCalls,
	});

	return confirmationRepRecordSchema.parse({
		caseId: rep.caseId,
		elapsedMs: repElapsedMs,
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
		stages: [
			{
				elapsedMs: stageElapsedMs,
				error: error.message,
				evidence: { recordFile, resultSha },
				judgeContractSha256: error.judgeContractSha256,
				...liveReadsField(liveReads),
				stage: rep.request.stage,
				status: "EXECUTION_FAILED",
			},
		],
		workerTrajectorySteps: evidence.workerTrajectorySteps,
		worktreePath: rep.worktreePath,
	});
}

export { completeRepRecord, rejectedJudgeRepRecord, RECORD_JSON_INDENT_SPACES };
export type {
	ReplayRepIdentity,
	CompletedReplayResult,
	ReplayRepUsage,
	JudgeRejection,
};
