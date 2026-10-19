import type {
	CalibrationContext,
	CurrentCalibrationSources,
} from "./calibration-context";
import { asCalibrationInput } from "./calibration-input";
import type { WorkflowStage } from "./config";
import type { StageScorecard } from "./contracts";
import { readCorpusInstructions } from "./corpus-file";
import type { ResolvedCorpusSource } from "./corpus-source";

async function readStageRubrics(
	stageScorecards: readonly Readonly<StageScorecard>[],
	readText: (path: string) => Promise<string>,
): Promise<ReadonlyMap<WorkflowStage, string>> {
	const stageRubrics = new Map<WorkflowStage, string>();
	await Array.fromAsync(stageScorecards, async (scorecard) => {
		stageRubrics.set(scorecard.stage, await readText(scorecard.rubricPath));
	});

	return stageRubrics;
}

async function readCurrentSources(
	context: Readonly<CalibrationContext>,
	source: ResolvedCorpusSource,
): Promise<CurrentCalibrationSources> {
	const [instructions, finalRubric] = await asCalibrationInput(
		async () =>
			await Promise.all([
				readCorpusInstructions(source),
				Bun.file(context.finalRubricPath).text(),
			]),
	);
	const stageRubrics = await readStageRubrics(
		context.stageScorecards,
		async (path) =>
			await asCalibrationInput(async () => await Bun.file(path).text()),
	);

	return { finalRubric, instructions, stageRubrics };
}

export { readStageRubrics, readCurrentSources };
