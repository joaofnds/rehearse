import { relative } from "node:path";

import type { ConfirmationRepResult } from "./confirmation-evidence";
import {
	settleCompletedConfirmationRep,
	settleDiagnosticConfirmationRep,
} from "./confirmation-evidence";
import type { JudgeOutputValidationError } from "./judge-attempt";
import { failedRepRecord } from "./replay-confirmation-failure-record";
import type { FailedStageEvidence } from "./replay-confirmation-failure-record";
import type { PreparedReplayStage } from "./replay-confirmation-preparation";
import type {
	CompletedReplayResult,
	ReplayRepIdentity,
} from "./replay-confirmation-rep-record";
import {
	RECORD_JSON_INDENT_SPACES,
	completeRepRecord,
	rejectedJudgeRepRecord,
} from "./replay-confirmation-rep-record";
import type { ReplayRepContext } from "./replay-confirmation-runtime";
import type { CompletedReplayStageRecord } from "./replay-confirmation-stage-record";
import {
	writeCompletedReplayStage,
	writeRejectedReplayStage,
} from "./replay-confirmation-stage-record";
import type { StageSessionResult } from "./stage-session-contract";
import { recordRetentionRef } from "./target";

interface CompletedReplayStage {
	readonly liveReads: CompletedReplayResult["liveReads"];
	readonly scorecard: CompletedReplayResult["scorecard"];
	readonly session: StageSessionResult;
	readonly productOwner: PreparedReplayStage["productOwner"];
	readonly stageElapsedMs: number;
	readonly readManifest: CompletedReplayStageRecord["readManifest"];
}
interface RejectedReplayStage {
	readonly session: StageSessionResult;
	readonly productOwner: PreparedReplayStage["productOwner"];
	readonly stageStart: number;
	readonly readManifest: CompletedReplayStageRecord["readManifest"];
}
class ReplayRepRecording {
	readonly #context: ReplayRepContext;
	public constructor(context: ReplayRepContext) {
		this.#context = context;
	}
	public async completed({
		liveReads,
		scorecard,
		session,
		productOwner,
		stageElapsedMs,
		readManifest,
	}: CompletedReplayStage): Promise<ConfirmationRepResult> {
		const {
			request,
			paths: repPaths,
			repStart,
			runtime: { now },
		} = this.#context;
		const scorecardFile = await writeCompletedReplayStage(
			repPaths,
			request.stage,
			{ readManifest, scorecard },
		);
		const record = completeRepRecord(
			this.identity(),
			{
				liveReads,
				resultSha: session.resultSha,
				scorecard,
				scorecardFile: relative(repPaths.directory, scorecardFile),
			},
			{
				productOwnerCalls: productOwner.snapshot().providerCalls,
				repElapsedMs: now() - repStart,
				stageElapsedMs,
				workerCalls: session.transcript.providerCalls,
			},
		);
		return await this.settle(record, session.resultSha);
	}
	public async rejected(
		failure: Readonly<JudgeOutputValidationError>,
		{ session, productOwner, stageStart, readManifest }: RejectedReplayStage,
	): Promise<ConfirmationRepResult> {
		const {
			request,
			paths: repPaths,
			repStart,
			runtime: { now },
		} = this.#context;
		const scorecardFile = await writeRejectedReplayStage(
			repPaths,
			request.stage,
			{ failure, readManifest },
		);
		const productOwnerCalls = productOwner.snapshot().providerCalls;
		const stageElapsedMs = now() - stageStart;
		const repElapsedMs = now() - repStart;
		const record = rejectedJudgeRepRecord(
			this.identity(),
			{
				error: failure,
				recordFile: relative(repPaths.directory, scorecardFile),
				resultSha: session.resultSha,
			},
			{
				productOwnerCalls,
				repElapsedMs,
				stageElapsedMs,
				workerCalls: session.transcript.providerCalls,
			},
		);
		return await this.settle(record, session.resultSha);
	}
	public async diagnostic(
		error: string,
		stageEvidence: FailedStageEvidence | undefined,
		worktreeCreated: boolean,
	): Promise<ConfirmationRepResult> {
		const {
			dependencies,
			plan,
			paths: repPaths,
			repStart,
			runtime: { now },
		} = this.#context;
		const record = failedRepRecord(this.identity(), {
			elapsedMs: now() - repStart,
			error,
			stageEvidence,
		});
		return await settleDiagnosticConfirmationRep({
			log: dependencies.log,
			preservedMessage: `Replay rep ${plan.repId} failed; evidence preserved at ${plan.worktreePath}`,
			recordContent: `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
			recordFile: repPaths.recordFile,
			worktreeCreated,
		});
	}
	private identity(): ReplayRepIdentity {
		const {
			request,
			plan,
			runtime: { frozen },
		} = this.#context;
		return {
			caseId: frozen.manifest.caseId,
			consumed: frozen.plan.consumed,
			ordinal: plan.ordinal,
			repId: plan.repId,
			request,
			worktreePath: plan.worktreePath,
		};
	}
	private async settle(
		record: ReturnType<typeof completeRepRecord>,
		resultSha: string,
	): Promise<ConfirmationRepResult> {
		const {
			dependencies,
			request,
			plan,
			paths: repPaths,
			runtime: { frozen },
		} = this.#context;
		return await settleCompletedConfirmationRep({
			recordContent: `${JSON.stringify(record, null, RECORD_JSON_INDENT_SPACES)}\n`,
			recordFile: repPaths.recordFile,
			recordRetentionRef,
			removeWorktree: dependencies.removeWorktree,
			resultSha,
			retentionName: `${request.groupId}/${plan.repId}`,
			targetRoot: frozen.sourceRoot,
			worktreePath: plan.worktreePath,
		});
	}
}
export default ReplayRepRecording;
