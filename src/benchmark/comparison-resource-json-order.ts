import type { JsonFieldOrder } from "./ordered-json";

const distributionOrder: JsonFieldOrder = {
	fields: ["values", "mean"],
};

const metricsOrder: JsonFieldOrder = {
	children: {
		cacheReadTokens: distributionOrder,
		cacheWriteTokens: distributionOrder,
		costUsd: distributionOrder,
		inputTokens: distributionOrder,
		outputTokens: distributionOrder,
	},
	fields: [
		"costUsd",
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
	],
};

const roleResourcesOrder: JsonFieldOrder = {
	children: {
		"final-judge": metricsOrder,
		"product-owner": metricsOrder,
		"stage-judge": metricsOrder,
		worker: metricsOrder,
	},
	fields: ["worker", "product-owner", "stage-judge", "final-judge"],
};

const missingEvidenceOrder: JsonFieldOrder = {
	fields: ["repId", "ordinal", "missing"],
};

const resourcesOrder: JsonFieldOrder = {
	children: {
		elapsedMs: distributionOrder,
		missingEvidence: missingEvidenceOrder,
		perRole: roleResourcesOrder,
		total: metricsOrder,
		workerTurns: distributionOrder,
	},
	fields: [
		"status",
		"completeReps",
		"missingMetricReps",
		"perRole",
		"total",
		"workerTurns",
		"elapsedMs",
		"missingEvidence",
	],
};

export { resourcesOrder, distributionOrder };
