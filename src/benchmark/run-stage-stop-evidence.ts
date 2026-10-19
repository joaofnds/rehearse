import type { StageTranscriptSource } from "./checkpoint";
import { preserveStageTranscript } from "./checkpoint";
import type { WorkflowStage } from "./config";
import type { PendingStage } from "./run-abort";
import { ceilingReadings, paidJudgeFailure } from "./run-final-judgment";
import type { StageContext } from "./run-stage-context";
import { SpendCeilingReachedError } from "./spend-ceiling";
import StageSessionError from "./stage-session-error";

/**
 * A paid call the ceiling refuses stops the run in the stage that made it,
 * so the stop is recorded against that stage before the refusal propagates.
 * A call that fails after spending to the ceiling stops it the same way,
 * since its budget was what the ceiling had left: a provider halts such a
 * call at that budget rather than returning a result. Any other failure
 * with the spend at the ceiling stops it too, such as a step between the
 * session and its Judge, since the stage's Judge could not be paid for.
 */
async function stoppingAtCeiling<Result>(
	context: Pick<
		StageContext,
		"spendCeiling" | "stageFile" | "stopAtCeiling" | "productOwner"
	>,
	stage: string,
	paid: () => Promise<Result>,
): Promise<Result> {
	try {
		return await paid();
	} catch (error) {
		const readings = ceilingReadings(
			error instanceof SpendCeilingReachedError ? error : undefined,
			context.spendCeiling,
		);
		if (readings !== undefined) {
			context.stopAtCeiling({
				file: context.stageFile(stage),
				stage,
				...readings,
				productOwner: context.productOwner.snapshot(),
				session:
					error instanceof StageSessionError
						? { costUsd: error.costUsd, providerCalls: error.providerCalls }
						: undefined,
			});
		}

		throw error;
	}
}

/**
 * Keeps the attempts a failed stage Judge paid for on the stage's pending
 * record, so the aborted stage artifact shows what the stage cost.
 */
function recordPaidStageJudgeFailure(
	context: Pick<
		StageContext,
		"spendCeiling" | "updatePendingStage" | "productOwner"
	>,
	readStage: PendingStage,
	error: Readonly<Error>,
): void {
	const paid = paidJudgeFailure(error, context.spendCeiling);
	if (paid === undefined) {
		return;
	}

	const { failure, ceilingStop } = paid;
	context.updatePendingStage({
		...readStage,
		ceilingStop,
		failure: {
			attempts: failure.attempts,
			costUsd: failure.costUsd,
			judgeProviderCalls: failure.providerCalls,
			prompt: failure.prompt,
		},
		productOwner:
			ceilingStop === undefined ? undefined : context.productOwner.snapshot(),
	});
}

/**
 * Copies the transcript of a stage that stopped the run beside its stop record.
 * No reader requires the copy, so a failed copy is reported and the stop ends
 * as it would have without it.
 */
async function keepStoppedTranscript(
	context: Readonly<StageContext>,
	stage: WorkflowStage,
	transcript: StageTranscriptSource | undefined,
): Promise<void> {
	try {
		await preserveStageTranscript(
			context.targetDir,
			context.stoppedSessionDirectory(stage),
			transcript,
		);
	} catch (error) {
		context.reportError(
			`Could not keep the ${stage} stage's transcript beside its stop record: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export {
	stoppingAtCeiling,
	recordPaidStageJudgeFailure,
	keepStoppedTranscript,
};
