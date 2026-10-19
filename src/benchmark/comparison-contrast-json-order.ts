import { distributionOrder } from "./comparison-resource-json-order";
import type { JsonFieldOrder } from "./ordered-json";

const caseDeltasOrder: JsonFieldOrder = {
	fields: ["caseId", "value"],
};

const intervalOrder: JsonFieldOrder = {
	fields: ["low", "high"],
};

const minuendOrder: JsonFieldOrder = {
	children: {
		interval: intervalOrder,
	},
	fields: ["successful", "requested", "rate", "interval"],
};

const successRateOrder: JsonFieldOrder = {
	children: {
		caseDeltas: caseDeltasOrder,
		minuend: minuendOrder,
		subtrahend: minuendOrder,
	},
	fields: [
		"caseDeltas",
		"meanDelta",
		"standardError",
		"minuend",
		"subtrahend",
		"delta",
	],
};

const passKOrder: JsonFieldOrder = {
	children: {
		caseDeltas: caseDeltasOrder,
	},
	fields: [
		"caseDeltas",
		"meanDelta",
		"standardError",
		"minuend",
		"subtrahend",
		"delta",
	],
};

const contrastQualityOrder: JsonFieldOrder = {
	children: {
		passK: passKOrder,
		successRate: successRateOrder,
	},
	fields: ["name", "successRate", "passK"],
};

const spreadOrder: JsonFieldOrder = {
	fields: ["status", "standardError"],
};

const metricEstimateOrder: JsonFieldOrder = {
	children: {
		caseDeltas: caseDeltasOrder,
		minuend: distributionOrder,
		spread: spreadOrder,
		subtrahend: distributionOrder,
	},
	fields: [
		"caseDeltas",
		"meanDelta",
		"standardError",
		"minuend",
		"subtrahend",
		"delta",
		"spread",
	],
};

const contrastMetricsOrder: JsonFieldOrder = {
	children: {
		cacheReadTokens: metricEstimateOrder,
		cacheWriteTokens: metricEstimateOrder,
		costUsd: metricEstimateOrder,
		inputTokens: metricEstimateOrder,
		outputTokens: metricEstimateOrder,
	},
	fields: [
		"costUsd",
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
	],
};

const contrastRoleResourcesOrder: JsonFieldOrder = {
	children: {
		"final-judge": contrastMetricsOrder,
		"product-owner": contrastMetricsOrder,
		"stage-judge": contrastMetricsOrder,
		worker: contrastMetricsOrder,
	},
	fields: ["worker", "product-owner", "stage-judge", "final-judge"],
};

const missingContrastEvidenceOrder: JsonFieldOrder = {
	fields: ["repId", "ordinal", "missing", "caseId", "arm"],
};

const contrastResourcesOrder: JsonFieldOrder = {
	children: {
		elapsedMs: metricEstimateOrder,
		missingEvidence: missingContrastEvidenceOrder,
		perRole: contrastRoleResourcesOrder,
		total: contrastMetricsOrder,
		workerTurns: metricEstimateOrder,
	},
	fields: [
		"status",
		"perRole",
		"total",
		"workerTurns",
		"elapsedMs",
		"missingEvidence",
	],
};

const contrastOrder: JsonFieldOrder = {
	children: {
		quality: contrastQualityOrder,
		resources: contrastResourcesOrder,
	},
	fields: ["minuend", "subtrahend", "quality", "resources"],
};

const contrastsOrder: JsonFieldOrder = {
	children: {
		baselineMinusControl: contrastOrder,
		candidateMinusBaseline: contrastOrder,
		candidateMinusControl: contrastOrder,
	},
	fields: [
		"candidateMinusBaseline",
		"candidateMinusControl",
		"baselineMinusControl",
	],
};

export { contrastsOrder as default };
