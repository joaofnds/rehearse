import {
	calibratableArtifactValidationOrder,
	humanReviewValidationOrder,
	judgeGradeValidationOrder,
	stageScorecardValidationOrder,
} from "./calibration-validation-order";
import { METRICS_ORDER, STAGE_EVIDENCE_ORDER } from "./judge-evidence";
import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";

// Existing scorecards passed through the record schema. A revised scorecard
// carries that parsed input but has newly executed, rather than parsed, attempts.
const revisedScorecardOrder: JsonFieldOrder = {
	...stageScorecardValidationOrder,
	children: {
		...stageScorecardValidationOrder.children,
		attempts: {
			children: { metrics: METRICS_ORDER },
			fields: ["payload", "costUsd", "outcome", "error", "metrics"],
		},
	},
};
const recordedCalibrationFieldOrder: JsonFieldOrder = {
	children: {
		humanReview: humanReviewValidationOrder,
		revisedGrade: judgeGradeValidationOrder,
		revisedStageScorecards: revisedScorecardOrder,
	},
	fields: [
		"humanReview",
		"instructionsChanged",
		"updatedInstructions",
		"rubricChanged",
		"updatedRubric",
		"revisedRubricIds",
		"revisedJudgePrompt",
		"revisedGrade",
		"rejudgeConfirmedByHuman",
		"stageRubricsChanged",
		"revisedStageScorecards",
	],
};
const calibrationFieldOrder: JsonFieldOrder = {
	...recordedCalibrationFieldOrder,
	children: {
		...recordedCalibrationFieldOrder.children,
		revisedStageScorecards: {
			...revisedScorecardOrder,
			children: {
				...revisedScorecardOrder.children,
				input: STAGE_EVIDENCE_ORDER,
			},
		},
	},
};

const judgeAgreementFieldOrder: JsonFieldOrder = {
	children: {
		baselines: {
			children: {
				criteria: {
					fields: [
						"rubricId",
						"sampleSize",
						"judgePassHumanPass",
						"judgeFailHumanFail",
						"judgePassHumanFail",
						"judgeFailHumanPass",
						"observedAgreement",
						"cohensKappa",
					],
				},
			},
			fields: ["judgeModel", "stage", "rubricSha256", "criteria"],
		},
	},
	fields: ["skippedCalibrations", "baselines"],
};
const finalRecordOrder: JsonFieldOrder = {
	...calibratableArtifactValidationOrder,
	children: {
		...calibratableArtifactValidationOrder.children,
		calibration: recordedCalibrationFieldOrder,
		judgeAgreement: judgeAgreementFieldOrder,
	},
};
const stoppedRecordOrder: JsonFieldOrder = {
	children: {
		...stageScorecardValidationOrder.children,
		calibration: recordedCalibrationFieldOrder,
		judgeAgreement: judgeAgreementFieldOrder,
	},
	fields: [
		"judgeModel",
		"judgeEffort",
		"sessionBudgetUsd",
		...stageScorecardValidationOrder.fields,
	],
};

interface CalibratedRecordSerialization {
	readonly json: string;
	readonly kind: "stage" | "final";
}

/** Calibrating a parsed record keeps the historical bytes later evidence reads. */
function calibratedRecordJson({
	json,
	kind,
}: CalibratedRecordSerialization): string {
	return `${orderedJson({ json, order: kind === "stage" ? stoppedRecordOrder : finalRecordOrder })}\n`;
}

export {
	calibratedRecordJson,
	calibrationFieldOrder,
	judgeAgreementFieldOrder,
};
