import type {
	PairedEstimate,
	SingleCaseMeanEstimate,
} from "./comparison-estimator";
import {
	buildPairedEstimate,
	buildSingleCaseMeanEstimate,
} from "./comparison-estimator";
import type { ComparisonArm } from "./comparison-record";
import type {
	AvailableArmResources,
	ComparisonResourceCase,
	ResourceMetricEstimates,
	ResourceMetricSummary,
	SingleCaseResourceMetricEstimates,
} from "./comparison-resource-contracts";
import type { Immutable } from "./contracts";

function availableResources(
	benchmarkCase: Immutable<ComparisonResourceCase>,
	arm: ComparisonArm,
): AvailableArmResources {
	const resources = benchmarkCase.arms[arm];
	if (resources.status === "UNAVAILABLE") {
		throw new Error(
			`case ${benchmarkCase.caseId} arm ${arm} resource evidence is unavailable`,
		);
	}

	return resources;
}

interface BuildMetricEstimateRequest {
	readonly cases: readonly ComparisonResourceCase[];
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
	readonly values: (resources: AvailableArmResources) => readonly number[];
}

function buildMetricEstimate(
	request: Readonly<BuildMetricEstimateRequest>,
): PairedEstimate {
	return buildPairedEstimate(
		request.cases.map((benchmarkCase) => ({
			caseId: benchmarkCase.caseId,
			minuend: request.values(
				availableResources(benchmarkCase, request.minuend),
			),
			subtrahend: request.values(
				availableResources(benchmarkCase, request.subtrahend),
			),
		})),
	);
}

interface BuildResourceMetricEstimatesRequest {
	readonly cases: readonly ComparisonResourceCase[];
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
	readonly metrics: (resources: AvailableArmResources) => ResourceMetricSummary;
}

function buildResourceMetricEstimates(
	request: Readonly<BuildResourceMetricEstimatesRequest>,
): ResourceMetricEstimates {
	const estimate = (
		values: (metrics: ResourceMetricSummary) => readonly number[],
	): PairedEstimate =>
		buildMetricEstimate({
			cases: request.cases,
			minuend: request.minuend,
			subtrahend: request.subtrahend,
			values: (resources) => values(request.metrics(resources)),
		});

	return {
		cacheReadTokens: estimate(({ cacheReadTokens }) => cacheReadTokens.values),
		cacheWriteTokens: estimate(
			({ cacheWriteTokens }) => cacheWriteTokens.values,
		),
		costUsd: estimate(({ costUsd }) => costUsd.values),
		inputTokens: estimate(({ inputTokens }) => inputTokens.values),
		outputTokens: estimate(({ outputTokens }) => outputTokens.values),
	};
}

function buildSingleCaseMetricEstimate(
	request: Readonly<BuildMetricEstimateRequest>,
): SingleCaseMeanEstimate {
	const [benchmarkCase] = request.cases;
	if (benchmarkCase === undefined) {
		throw new Error("A single-case resource estimate requires one case");
	}

	return buildSingleCaseMeanEstimate({
		minuend: request.values(availableResources(benchmarkCase, request.minuend)),
		subtrahend: request.values(
			availableResources(benchmarkCase, request.subtrahend),
		),
	});
}

function buildSingleCaseResourceMetricEstimates(
	request: Readonly<BuildResourceMetricEstimatesRequest>,
): SingleCaseResourceMetricEstimates {
	const estimate = (
		values: (metrics: ResourceMetricSummary) => readonly number[],
	): SingleCaseMeanEstimate =>
		buildSingleCaseMetricEstimate({
			cases: request.cases,
			minuend: request.minuend,
			subtrahend: request.subtrahend,
			values: (resources) => values(request.metrics(resources)),
		});

	return {
		cacheReadTokens: estimate(({ cacheReadTokens }) => cacheReadTokens.values),
		cacheWriteTokens: estimate(
			({ cacheWriteTokens }) => cacheWriteTokens.values,
		),
		costUsd: estimate(({ costUsd }) => costUsd.values),
		inputTokens: estimate(({ inputTokens }) => inputTokens.values),
		outputTokens: estimate(({ outputTokens }) => outputTokens.values),
	};
}

export {
	buildMetricEstimate,
	buildResourceMetricEstimates,
	buildSingleCaseMetricEstimate,
	buildSingleCaseResourceMetricEstimates,
};
