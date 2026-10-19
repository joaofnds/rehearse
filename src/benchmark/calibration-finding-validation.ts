import { CalibrationIncompleteError } from "./calibration-input";
import type { WorkflowStage } from "./config";
import type { HumanReview, JudgeGrade, StageScorecard } from "./contracts";

const NO_REAL_DEFECTS = 0;
interface CalibrationFinalGrades {
	readonly originalGrade?: JudgeGrade | undefined;
	readonly revisedGrade?: JudgeGrade | undefined;
}

interface CalibrationStageGrades {
	readonly originalStageScorecards?: readonly StageScorecard[] | undefined;
	readonly revisedStageScorecards?: readonly StageScorecard[] | undefined;
}

function validateCalibration(
	review: HumanReview,
	{ originalGrade, revisedGrade }: CalibrationFinalGrades = {},
	{
		originalStageScorecards = [],
		revisedStageScorecards = [],
	}: CalibrationStageGrades = {},
): void {
	const realDefects = review.findings.filter(({ judgeAssessment }) =>
		["CAUGHT", "MISSED"].includes(judgeAssessment),
	);

	if (review.verdict === "ACCEPT" && realDefects.length > NO_REAL_DEFECTS) {
		throw new CalibrationIncompleteError(
			"Human review cannot accept a candidate with real defects",
		);
	}

	for (const finding of review.findings) {
		if (finding.judgeAssessment !== "NOT_PROMOTED") {
			const rubricId = finding.rubricId ?? "";
			if (finding.stage === "final") {
				validateFinalFinding(
					{ assessment: finding.judgeAssessment, label: "", rubricId },
					{ originalGrade, revisedGrade },
				);
			} else {
				validateStageFinding(
					{
						assessment: finding.judgeAssessment,
						rubricId,
						stage: finding.stage,
					},
					{
						originalScorecards: originalStageScorecards,
						revisedScorecards: revisedStageScorecards,
					},
				);
			}
		}
	}
}

type ConfirmedAssessment = Exclude<
	HumanReview["findings"][number]["judgeAssessment"],
	"NOT_PROMOTED"
>;

interface StageCalibrationFinding {
	readonly stage: WorkflowStage;
	readonly assessment: ConfirmedAssessment;
	readonly rubricId: string;
}

interface CalibrationScorecards {
	readonly originalScorecards: readonly StageScorecard[];
	readonly revisedScorecards: readonly StageScorecard[];
}

function validateStageFinding(
	{ stage, assessment, rubricId }: StageCalibrationFinding,
	{ originalScorecards, revisedScorecards }: CalibrationScorecards,
): void {
	const original = originalScorecards.find(
		(scorecard) => scorecard.stage === stage,
	);
	if (!original) {
		throw new CalibrationIncompleteError(`No ${stage} scorecard was recorded`);
	}

	const revised = revisedScorecards.find(
		(scorecard) => scorecard.stage === stage,
	);
	assertFindingMatchesGrades(
		{ assessment, label: `${stage} `, rubricId },
		{
			originalFailure: stageItemFailure(original, rubricId),
			revisedAvailable: revised !== undefined,
			revisedFailure: revised && stageItemFailure(revised, rubricId),
		},
	);
}

interface CalibrationFinding {
	readonly assessment: ConfirmedAssessment;
	readonly rubricId: string;
	readonly label: string;
}

interface CalibrationFailureReadings {
	readonly originalFailure: boolean | undefined;
	readonly revisedAvailable: boolean;
	readonly revisedFailure: boolean | undefined;
}

function assertFindingMatchesGrades(
	{ assessment, rubricId, label }: CalibrationFinding,
	{
		originalFailure,
		revisedAvailable,
		revisedFailure,
	}: CalibrationFailureReadings,
): void {
	if (assessment === "CAUGHT") {
		if (originalFailure !== true) {
			throw new CalibrationIncompleteError(
				`Original ${label}Judge did not catch ${rubricId}`,
			);
		}

		return;
	}

	assertRevisedFinding(
		{ assessment, label, rubricId },
		{ originalFailure, revisedAvailable, revisedFailure },
	);
}

function stageItemFailure(
	scorecard: StageScorecard,
	rubricId: string,
): boolean | undefined {
	const blocker = scorecard.grade.hardBlockers.find(
		({ id }) => id === rubricId,
	);
	if (blocker) {
		return blocker.status === "FAIL";
	}

	const requirement = scorecard.grade.requirements.find(
		({ id }) => id === rubricId,
	);
	if (requirement) {
		return requirement.status === "FAIL";
	}

	const dimension = scorecard.grade.dimensions.find(
		({ id }) => id === rubricId,
	);
	if (dimension) {
		return ["C", "D", "F"].includes(dimension.grade);
	}

	return undefined;
}

function validateFinalFinding(
	finding: CalibrationFinding,
	{ originalGrade, revisedGrade }: CalibrationFinalGrades,
): void {
	const { rubricId } = finding;
	if (!originalGrade) {
		throw new CalibrationIncompleteError(
			"Final-stage findings require a final Judge grade",
		);
	}

	const originalRequirement = originalGrade.requirements.find(
		({ id }) => id === rubricId,
	);
	const revisedRequirement = revisedGrade?.requirements.find(
		({ id }) => id === rubricId,
	);
	assertFindingMatchesGrades(finding, {
		originalFailure: originalRequirement?.status === "FAIL",
		revisedAvailable: revisedGrade !== undefined,
		revisedFailure: revisedRequirement?.status === "FAIL",
	});
}

function assertRevisedFinding(
	{ assessment, rubricId, label }: CalibrationFinding,
	{
		originalFailure,
		revisedAvailable,
		revisedFailure,
	}: CalibrationFailureReadings,
): void {
	if (!revisedAvailable) {
		throw new CalibrationIncompleteError(
			`${assessment} requires a revised grade`,
		);
	}

	if (assessment === "MISSED" && originalFailure === true) {
		throw new CalibrationIncompleteError(
			`Original ${label}Judge already caught ${rubricId}`,
		);
	}

	if (assessment === "MISSED" && revisedFailure !== true) {
		throw new CalibrationIncompleteError(
			`Revised ${label}rubric does not catch ${rubricId}`,
		);
	}

	if (
		assessment === "FALSE_POSITIVE" &&
		(originalFailure !== true || revisedFailure !== false)
	) {
		throw new CalibrationIncompleteError(
			`Revised ${label}rubric does not correct ${rubricId}`,
		);
	}
}

export { validateCalibration as default };
