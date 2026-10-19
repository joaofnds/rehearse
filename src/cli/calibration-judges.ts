import type { CalibrationJudges } from "#benchmark/calibration";
import type { Effort } from "#benchmark/config";
import { runJudge } from "#benchmark/judge";
import type { JudgeBudget } from "#benchmark/judge-attempt";
import type { SpendCeiling } from "#benchmark/spend-ceiling";
import { runStageJudge } from "#benchmark/stage-grading";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

interface JudgeKnobs {
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

interface CalibrateJudges {
	readonly stageJudge: CalibrationJudges["stageJudge"];
	readonly finalJudge: NonNullable<CalibrationJudges["finalJudge"]>;
}

/**
 * A rejudge runs under the model, effort, and budget the original Judge ran
 * under, which the record carries. The agreement baseline is keyed on the exact
 * Judge model, so a rejudge under a different one would start a new baseline
 * instead of adding to the run's, and running at the provider's default effort
 * rather than the recorded one would compare two Judges rather than two
 * rubrics.
 *
 * A record written before the budget was recorded has none, so the rejudge it
 * would need is refused rather than run at a limit nobody set.
 */
function judgesFor(
	knobs: Readonly<JudgeKnobs>,
	spendCeiling: SpendCeiling,
): CalibrateJudges {
	const budget = (): JudgeBudget => {
		if (knobs.sessionBudgetUsd === undefined) {
			throw new RefusedPreconditionError(
				"This run recorded no session budget, so its evidence cannot be rejudged under the limit it ran with; calibrate it against the rubrics it froze",
			);
		}

		return { sessionBudgetUsd: knobs.sessionBudgetUsd, spendCeiling };
	};

	return {
		finalJudge: async (rubric, candidate) =>
			await runJudge(
				{
					budget: budget(),
					effort: knobs.judgeEffort,
					model: knobs.judgeModel,
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
		stageJudge: async (scorecard, source) =>
			await runStageJudge(
				{
					budget: budget(),
					effort: knobs.judgeEffort,
					model: knobs.judgeModel,
				},
				{ evidenceOrigin: "record", input: scorecard.input, source },
			),
	};
}

export { judgesFor as default };
export type { CalibrateJudges, JudgeKnobs };
