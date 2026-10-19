import type {
	CalibrationContext,
	CalibrationJudges,
	FrozenCalibrationEvidence,
	Questioner,
} from "./calibration-context";
import calibrate from "./calibration-execution";
import {
	CalibrationIncompleteError,
	asCalibrationInput,
	parseHumanReview,
} from "./calibration-input";
import calibrationJudges from "./calibration-judges";
import { readCurrentSources } from "./calibration-sources";
import type { CalibrationResult } from "./contracts";
import { liveCorpusSource, resolveCorpusFile } from "./corpus-file";
import type { LiveCorpusRoot } from "./corpus-file";
import type { ResolvedCorpusSource } from "./corpus-source";
import serialMap from "./serial-map";

const HUMAN_REVIEW_INDENT_SPACES = 2;
async function writeHumanReviewTemplate(path: string): Promise<void> {
	await Bun.write(
		path,
		`${JSON.stringify(
			{
				findings: [],
				summary: "",
				verdict: "REPLACE_WITH_ACCEPT_OR_REJECT",
			},
			null,
			HUMAN_REVIEW_INDENT_SPACES,
		)}\n`,
	);
}

async function measuredCorpus(): Promise<LiveCorpusRoot> {
	return await Promise.resolve(liveCorpusSource());
}

interface CalibrationReviewPrompt {
	readonly context: Readonly<CalibrationContext>;
	readonly editTargets: string;
}

function* reviewResponses({
	context,
	editTargets,
}: CalibrationReviewPrompt): Generator<Promise<string>> {
	while (true) {
		yield context.rl.question(
			`Review the completed stages in ${context.targetDir}. Record every finding with its stage in ${context.reviewFile}. Update ${editTargets} where justified, then press Enter to validate the calibration.`,
		);
	}
}

async function collectCalibration(
	context: CalibrationContext,
): Promise<CalibrationResult> {
	const { source, editTargets, frozen, judges } =
		await prepareCalibration(context);

	for await (const reviewFile of serialMap(
		reviewResponses({ context, editTargets }),
		async (response) => {
			await response;
			return context.reviewFile;
		},
	)) {
		try {
			const humanReview = parseHumanReview(
				await asCalibrationInput(async () => await Bun.file(reviewFile).text()),
			);
			const current = await readCurrentSources(context, source);

			return await calibrate(
				{ current, frozen, review: humanReview },
				judges,
				async () => await askRejudgeConfirmation(context.rl),
			);
		} catch (error) {
			if (!(error instanceof CalibrationIncompleteError)) {
				throw error;
			}

			await context.reportError(`Calibration incomplete: ${error.message}`);
		}
	}

	throw new Error("Calibration input ended without a completed review");
}

async function askRejudgeConfirmation(rl: Questioner): Promise<boolean> {
	const confirmation = await rl.question(
		"Confirm that the revised Judge result catches or corrects each finding for the right reason. Type yes to finalize, or anything else to revise the rubric: ",
	);

	return confirmation.trim().toLowerCase() === "yes";
}

interface PreparedCalibration {
	readonly source: ResolvedCorpusSource;
	readonly editTargets: string;
	readonly frozen: FrozenCalibrationEvidence;
	readonly judges: CalibrationJudges;
}

async function prepareCalibration(
	context: CalibrationContext,
): Promise<PreparedCalibration> {
	await writeHumanReviewTemplate(context.reviewFile);
	const source = await (context.resolveCorpus ?? measuredCorpus)();
	const instructionsPath = resolveCorpusFile(source, "CLAUDE.md");
	const editTargets = context.finalCandidate
		? `${instructionsPath}, ${context.finalRubricPath}, and/or the relevant file under ${context.rubricsDirectory}`
		: `${instructionsPath} and/or the relevant file under ${context.rubricsDirectory}`;
	const frozen: FrozenCalibrationEvidence = {
		finalCandidate: context.finalCandidate,
		finalRubric: context.originalRubric,
		instructions: context.originalInstructions,
		stageScorecards: context.stageScorecards,
	};
	const judges = calibrationJudges(context);

	return { editTargets, frozen, judges, source };
}

export { collectCalibration };

export { default as calibrate } from "./calibration-execution";
export {
	CalibrationIncompleteError,
	parseHumanReview,
} from "./calibration-input";
export { default as validateCalibration } from "./calibration-finding-validation";
export { readStageRubrics } from "./calibration-sources";

export type {
	Questioner,
	FinalCandidate,
	FrozenCalibrationEvidence,
	CurrentCalibrationSources,
	CalibrationJudges,
} from "./calibration-context";
