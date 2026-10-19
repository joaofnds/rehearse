import type {
	CalibrationExecution,
	CurrentCalibrationSources,
	FrozenCalibrationEvidence,
	StageCalibrationSource,
} from "./calibration-context";
import { asCalibrationInput } from "./calibration-input";
import type { WorkflowStage } from "./config";
import type { JudgeGrade, StageScorecard } from "./contracts";
import { validateRubricDefinition } from "./judge";
import { parseStageRubric } from "./stage-rubric";

const RECORD_JSON_INDENT_SPACES = 2;

interface StageRejudge {
	readonly stageRubricsChanged: readonly WorkflowStage[];
	readonly revisedStageScorecards: readonly StageScorecard[];
}

async function rejudgeStages(
	frozen: Readonly<FrozenCalibrationEvidence>,
	current: Readonly<CurrentCalibrationSources>,
	{ judges, log }: CalibrationExecution,
): Promise<StageRejudge> {
	const revisedStageScorecards: StageScorecard[] = [];
	const stageRubricsChanged: WorkflowStage[] = [];

	await Array.fromAsync(frozen.stageScorecards, async (scorecard) => {
		const content = current.stageRubrics.get(scorecard.stage);
		if (content === undefined) {
			return;
		}

		const updatedStageRubric = await asCalibrationInput(() =>
			parseStageRubric(content, scorecard.input.kind),
		);
		if (
			JSON.stringify(updatedStageRubric) === JSON.stringify(scorecard.rubric)
		) {
			return;
		}

		stageRubricsChanged.push(scorecard.stage);
		revisedStageScorecards.push(
			await rejudgeStage(
				scorecard,
				{
					content,
					rubric: updatedStageRubric,
					rubricPath: scorecard.rubricPath,
				},
				{ judges, log },
			),
		);
	});

	return { revisedStageScorecards, stageRubricsChanged };
}

interface FinalRejudge {
	readonly revisedRubricIds?: readonly string[] | undefined;
	readonly revisedJudgePrompt?: string | undefined;
	readonly revisedGrade?: JudgeGrade | undefined;
}

async function rejudgeFinal(
	frozen: Readonly<FrozenCalibrationEvidence>,
	updatedRubric: string,
	{ judges, log }: CalibrationExecution,
): Promise<FinalRejudge> {
	const { finalCandidate: candidate } = frozen;
	const { finalJudge } = judges;
	if (candidate === undefined || finalJudge === undefined) {
		return {};
	}

	const revisedRubricIds = await asCalibrationInput(() =>
		validateRubricDefinition(updatedRubric),
	);
	log?.("\nRejudging the same candidate with the revised rubric");
	const revised = await asCalibrationInput(
		async () => await finalJudge(updatedRubric, candidate),
	);
	log?.(JSON.stringify(revised.grade, null, RECORD_JSON_INDENT_SPACES));

	return {
		revisedGrade: revised.grade,
		revisedJudgePrompt: revised.prompt,
		revisedRubricIds,
	};
}

async function rejudgeStage(
	scorecard: StageScorecard,
	source: StageCalibrationSource,
	{ judges, log }: CalibrationExecution,
): Promise<StageScorecard> {
	log?.(`\nRejudging the same ${scorecard.stage} stage`);
	const revisedScorecard = await asCalibrationInput(
		async () => await judges.stageJudge(scorecard, source),
	);
	log?.(
		JSON.stringify(revisedScorecard.grade, null, RECORD_JSON_INDENT_SPACES),
	);

	return revisedScorecard;
}

export { rejudgeStages, rejudgeFinal };
