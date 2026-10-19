import type { FrozenCalibrationEvidence } from "#benchmark/calibration";
import type { CalibratableStageRecord } from "#benchmark/calibration-record";
import type { CalibrationResult, StageScorecard } from "#benchmark/contracts";
import type { JudgeAgreementCalibration } from "#benchmark/judge-agreement";

import type { CalibratableRecord } from "./calibration-input-record";
import type { JudgeKnobs } from "./calibration-judges";

function frozenEvidence(
	record: Readonly<CalibratableRecord>,
): FrozenCalibrationEvidence {
	if (record.kind === "stage") {
		const { record: stage } = record;

		return {
			finalRubric: "",
			instructions: stage.input.instructions,
			stageScorecards: [asScorecard(stage)],
		};
	}

	const { record: artifact } = record;

	return {
		finalCandidate: {
			baselineContext: artifact.baselineContext,
			changedPaths: artifact.changedPaths,
			checkIntegrity: artifact.checkIntegrity,
			diff: artifact.diff,
			localChecks: artifact.localChecks,
			originalGrade: artifact.grade,
		},
		finalRubric: artifact.rubric,
		instructions: artifact.instructions,
		stageScorecards: artifact.stageScorecards,
	};
}

function asScorecard(stage: Readonly<CalibratableStageRecord>): StageScorecard {
	return {
		attempts: stage.attempts,
		costUsd: stage.costUsd,
		grade: stage.grade,
		input: stage.input,
		prompt: stage.prompt,
		rubric: stage.rubric,
		rubricPath: stage.rubricPath,
		stage: stage.stage,
	};
}

/**
 * The knobs the rejudge runs under, taken off whichever record the run left.
 * Passed as themselves rather than as the record they came from, so a field
 * the record happens to share a name with cannot reach the Judge.
 */
function judgeKnobsOf(record: Readonly<CalibratableRecord>): JudgeKnobs {
	return {
		judgeEffort: record.record.judgeEffort,
		judgeModel: record.record.judgeModel,
		sessionBudgetUsd: record.record.sessionBudgetUsd,
	};
}

function recordedCaseId(
	record: Readonly<CalibratableRecord>,
): string | undefined {
	return record.kind === "final" ? record.record.caseId : undefined;
}

function agreementInput(
	record: Readonly<CalibratableRecord>,
	calibration: Readonly<CalibrationResult>,
): JudgeAgreementCalibration {
	if (record.kind === "stage") {
		return {
			humanReview: calibration.humanReview,
			judgeModel: record.record.judgeModel,
			stages: [asScorecard(record.record)],
		};
	}

	return {
		final: { grade: record.record.grade, rubric: record.record.rubric },
		humanReview: calibration.humanReview,
		judgeModel: record.record.judgeModel,
		stages: record.record.stageScorecards,
	};
}

export { agreementInput, frozenEvidence, judgeKnobsOf, recordedCaseId };
