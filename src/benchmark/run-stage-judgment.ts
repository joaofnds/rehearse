import type { StageJudgmentExecution } from "./run-stage-judgment-contract";
import gradePaidStage from "./run-stage-paid-judgment";
import { recordStageVerdict, stageElapsedMs } from "./run-stage-verdict";
import reviewStoppedStage from "./run-stopped-stage-review";
import { assertStageGradePassed } from "./stage-grade";

async function judgePreparedStage(
	request: StageJudgmentExecution,
): Promise<void> {
	const { context, history, prepared } = request;
	const { stageStartedAtMs } = prepared.observation;
	const scorecard = await gradePaidStage(request);
	history.appendScorecard(scorecard);
	const elapsedMs = stageElapsedMs(context.elapsedMs, stageStartedAtMs);
	const { stageRecord, stops } = await recordStageVerdict({
		context,
		elapsedMs,
		prepared,
		scorecard,
	});
	if (stops) {
		await reviewStoppedStage({
			context,
			elapsedMs,
			history,
			prepared,
			scorecard,
			stageRecord,
		});
	}
	assertStageGradePassed(scorecard, context.minimumStageGrade);
}

export { judgePreparedStage as default };
