import type { StageScorecard } from "./contracts";
import type { StageJudgmentExecution } from "./run-stage-judgment-contract";
import {
	keepStoppedTranscript,
	recordPaidStageJudgeFailure,
	stoppingAtCeiling,
} from "./run-stage-stop-evidence";

const UNRECORDED_ELAPSED_MS = 0;

async function gradePaidStage({
	dependencies,
	context,
	prepared,
}: StageJudgmentExecution): Promise<StageScorecard> {
	const { readStage, rubric, stageTranscript, observation } = prepared;
	const { input, stage } = observation;

	try {
		return await stoppingAtCeiling(
			context,
			stage,
			async () =>
				await dependencies.runStageJudge(
					{
						budget: {
							sessionBudgetUsd: context.sessionBudgetUsd,
							spendCeiling: context.spendCeiling,
						},
						effort: context.judgeEffort,
						model: context.judgeModel,
					},
					{ input, source: rubric },
					{
						invoke: undefined,
						onProgress: (progress) => {
							context.runEvents?.recordJudgeProgress(
								stage,
								{
									elapsedMs: context.elapsedMs?.() ?? UNRECORDED_ELAPSED_MS,
									spentUsd: input.transcript.costUsd,
								},
								progress,
							);
						},
					},
				),
		);
	} catch (error) {
		if (error instanceof Error) {
			recordPaidStageJudgeFailure(context, readStage, error);
		}
		await keepStoppedTranscript(context, stage, stageTranscript);

		throw error;
	}
}

export { gradePaidStage as default };
