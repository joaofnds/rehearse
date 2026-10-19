import type {
	CalibrationContext,
	CalibrationJudges,
} from "./calibration-context";
import { runJudge } from "./judge";
import type { JudgeBudget } from "./judge-attempt";
import { runStageJudge } from "./stage-grading";

function judgeBudgetOf(context: Readonly<CalibrationContext>): JudgeBudget {
	return {
		sessionBudgetUsd: context.sessionBudgetUsd,
		spendCeiling: context.spendCeiling,
	};
}

function calibrationJudges(
	context: Readonly<CalibrationContext>,
): CalibrationJudges {
	return {
		finalJudge: async (rubric, candidate) =>
			await runJudge(
				{
					budget: judgeBudgetOf(context),
					effort: context.judgeEffort,
					model: context.judgeModel,
				},
				{
					baselineContext: candidate.baselineContext,
					changedPaths: candidate.changedPaths,
					checkIntegrity: candidate.checkIntegrity,
					diff: candidate.diff,
					localChecks: candidate.localChecks,
					rubric,
				},
			),
		log: context.log,
		stageJudge: async (scorecard, source) =>
			await (context.stageJudge ?? runStageJudge)(
				{
					budget: judgeBudgetOf(context),
					effort: context.judgeEffort,
					model: context.judgeModel,
				},
				{
					evidenceOrigin: context.stageEvidenceOrigin,
					input: scorecard.input,
					source,
				},
			),
	};
}

export { calibrationJudges as default };
