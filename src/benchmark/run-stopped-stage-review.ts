import { DEFAULT_MINIMUM_STAGE_GRADE } from "./config";
import type { StageJudgeRecord, StageScorecard } from "./contracts";
import type { StageContext } from "./run-stage-context";
import type { StageRunHistory } from "./run-stage-history";
import type { PreparedStageJudgment } from "./run-stage-judgment-contract";
import { keepStoppedTranscript } from "./run-stage-stop-evidence";

interface StoppedStageReview {
	readonly context: StageContext;
	readonly prepared: PreparedStageJudgment;
	readonly history: StageRunHistory;
	readonly scorecard: StageScorecard;
	readonly stageRecord: StageJudgeRecord;
	readonly elapsedMs: number | undefined;
}

async function reviewStoppedStage({
	context,
	prepared,
	history,
	scorecard,
	stageRecord,
	elapsedMs,
}: StoppedStageReview): Promise<void> {
	const { readStage, stageTranscript, observation } = prepared;
	const { stage } = observation;

	const stopped = {
		elapsedMs,
		minimumGrade: context.minimumStageGrade ?? DEFAULT_MINIMUM_STAGE_GRADE,
		runElapsedMs: context.elapsedMs?.(),
	};

	const productOwner = context.productOwner.snapshot();

	context.updatePendingStage({
		...readStage,
		productOwner,
		scorecard,
		stopped,
	});

	const calibration = await context.calibrateStageFailure(history.scorecards);

	if (calibration !== undefined) {
		const judgeAgreement = await context.collectJudgeAgreement([
			{
				humanReview: calibration.humanReview,
				judgeModel: context.judgeModel,
				stages: history.scorecards,
			},
		]);
		await context.completeStage({
			...stageRecord,
			calibration,
			judgeAgreement,
		});
	}

	await keepStoppedTranscript(context, stage, stageTranscript);
}

export { reviewStoppedStage as default };
