import type { JsonFieldOrder } from "./ordered-json";

const agreementCriterionOrder: JsonFieldOrder = {
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
};

const agreementBaselineOrder: JsonFieldOrder = {
	children: {
		criteria: agreementCriterionOrder,
	},
	fields: ["judgeModel", "stage", "rubricSha256", "criteria"],
};

const judgeAgreementOrder: JsonFieldOrder = {
	children: {
		baselines: agreementBaselineOrder,
	},
	fields: ["skippedCalibrations", "baselines"],
};

export { judgeAgreementOrder as default };
