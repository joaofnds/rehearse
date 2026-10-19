import type { StageJudgeRecord, StageScorecard } from "./contracts";
import type { StageContext } from "./run-stage-context";
import type { PreparedStageJudgment } from "./run-stage-judgment-contract";
import { stageGradePassed } from "./stage-grade";

interface StageVerdictRequest {
	readonly context: StageContext;
	readonly prepared: PreparedStageJudgment;
	readonly scorecard: StageScorecard;
	readonly elapsedMs: number | undefined;
}

interface RecordedStageVerdict {
	readonly stageRecord: StageJudgeRecord;
	readonly stops: boolean;
}

function stageElapsedMs(
	runElapsedMs: (() => number) | undefined,
	stageStartedAtMs: number | undefined,
): number | undefined {
	if (runElapsedMs === undefined || stageStartedAtMs === undefined) {
		return undefined;
	}

	return runElapsedMs() - stageStartedAtMs;
}

async function recordStageVerdict({
	context,
	prepared,
	scorecard,
	elapsedMs,
}: StageVerdictRequest): Promise<RecordedStageVerdict> {
	const { corpusFiles, corpusVersion } = prepared.observation;
	const { readManifest } = prepared;

	const stageRecord: StageJudgeRecord = {
		...scorecard,
		corpusFiles,
		corpusVersion,
		effort: context.effort,
		elapsedMs,
		judgeEffort: context.judgeEffort,
		judgeModel: context.judgeModel,
		model: context.model,
		readManifest,
		sessionBudgetUsd: context.sessionBudgetUsd,
	};

	const stops = !stageGradePassed(scorecard, context.minimumStageGrade);

	const writeStageRecord = stops
		? context.writeStageProgress
		: context.completeStage;

	await writeStageRecord(stageRecord);
	return { stageRecord, stops };
}

export { stageElapsedMs, recordStageVerdict };
