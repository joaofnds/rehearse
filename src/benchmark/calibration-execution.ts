import type {
	CalibrationJudges,
	CurrentCalibrationSources,
	FrozenCalibrationEvidence,
} from "./calibration-context";
import validateCalibration from "./calibration-finding-validation";
import { CalibrationIncompleteError } from "./calibration-input";
import { rejudgeFinal, rejudgeStages } from "./calibration-rejudge";
import type { CalibrationResult, HumanReview } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

interface CalibrationEvidence {
	readonly frozen: Readonly<FrozenCalibrationEvidence>;
	readonly current: Readonly<CurrentCalibrationSources>;
	readonly review: Readonly<HumanReview>;
}

async function calibrate(
	{ frozen, current, review }: CalibrationEvidence,
	judges: Readonly<CalibrationJudges>,
	confirmRejudge: () => Promise<boolean> = async () =>
		await Promise.resolve(true),
): Promise<CalibrationResult> {
	const { log } = judges;
	const changes = {
		instructionsChanged: current.instructions !== frozen.instructions,
		rubricChanged: current.finalRubric !== frozen.finalRubric,
	};
	const { stageRubricsChanged, revisedStageScorecards } = await rejudgeStages(
		frozen,
		current,
		{ judges, log },
	);
	const revised = changes.rubricChanged
		? await rejudgeFinal(frozen, current.finalRubric, { judges, log })
		: {};
	const { revisedGrade } = revised;

	validateCalibration(
		review,
		{ originalGrade: frozen.finalCandidate?.originalGrade, revisedGrade },
		{ originalStageScorecards: frozen.stageScorecards, revisedStageScorecards },
	);
	const rejudged =
		revisedGrade !== undefined ||
		revisedStageScorecards.length > EMPTY_COLLECTION_LENGTH;
	if (rejudged && !(await confirmRejudge())) {
		throw new CalibrationIncompleteError(
			"Revised Judge result was not confirmed",
		);
	}

	return calibrationResult({
		...revised,
		changes,
		current,
		rejudged,
		review,
		revisedStageScorecards,
		stageRubricsChanged,
	});
}

interface CalibrationReading
	extends
		Awaited<ReturnType<typeof rejudgeStages>>,
		Awaited<ReturnType<typeof rejudgeFinal>> {
	readonly review: HumanReview;
	readonly current: CurrentCalibrationSources;
	readonly rejudged: boolean;
	readonly changes: {
		readonly instructionsChanged: boolean;
		readonly rubricChanged: boolean;
	};
}
function calibrationResult({
	changes,
	current,
	review,
	rejudged,
	revisedGrade,
	revisedJudgeContractSha256,
	revisedJudgePrompt,
	revisedRubricIds,
	revisedStageScorecards,
	stageRubricsChanged,
}: CalibrationReading): CalibrationResult {
	return {
		humanReview: review,
		instructionsChanged: changes.instructionsChanged,
		rejudgeConfirmedByHuman: rejudged ? true : undefined,
		revisedGrade,
		revisedJudgeContractSha256,
		revisedJudgePrompt,
		revisedRubricIds,
		revisedStageScorecards:
			revisedStageScorecards.length > EMPTY_COLLECTION_LENGTH
				? revisedStageScorecards
				: undefined,
		rubricChanged: changes.rubricChanged,
		stageRubricsChanged,
		updatedInstructions: changes.instructionsChanged
			? current.instructions
			: undefined,
		updatedRubric: changes.rubricChanged ? current.finalRubric : undefined,
	};
}
export { calibrate as default };
