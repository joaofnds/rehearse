import type { ComparisonProjectionInput } from "./comparison-evidence";
import type {
	ArmResources,
	ComparisonResourceCase,
	MetricValueSummary,
	ResourceMetricSummary,
} from "./comparison-resource-contracts";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type { MetricDistributions } from "./confirmation-report";
import { buildResourceReport } from "./confirmation-report";
import type { Immutable } from "./contracts";

const NO_MISSING_METRIC_REPS = 0;

const NO_RECORDED_GROUP_MAKESPAN_MS = 0;

const EMPTY_OBSERVATION_TOTAL = 0;

const EMPTY_COLLECTION_LENGTH = 0;

function mean(values: readonly number[]): number {
	if (values.length === EMPTY_COLLECTION_LENGTH) {
		throw new Error("A paired estimate requires observations in every arm");
	}

	const sorted = values.toSorted((left, right) => left - right);

	return (
		sorted.reduce((total, value) => total + value, EMPTY_OBSERVATION_TOTAL) /
		sorted.length
	);
}

function metricValueSummary(values: readonly number[]): MetricValueSummary {
	return { mean: mean(values), values };
}

function resourceMetricSummary(
	distributions: Immutable<MetricDistributions>,
): ResourceMetricSummary {
	return {
		cacheReadTokens: metricValueSummary(distributions.cacheReadTokens),
		cacheWriteTokens: metricValueSummary(distributions.cacheWriteTokens),
		costUsd: metricValueSummary(distributions.costUsd),
		inputTokens: metricValueSummary(distributions.inputTokens),
		outputTokens: metricValueSummary(distributions.outputTokens),
	};
}

function armResources(
	contract: Immutable<ComparisonProjectionInput["contract"]>,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): ArmResources {
	const missingEvidence = reps.flatMap((rep) =>
		rep.metrics.status === "MISSING"
			? [
					{
						missing: rep.metrics.missing,
						ordinal: rep.ordinal,
						repId: rep.repId,
					},
				]
			: [],
	);
	if (missingEvidence.length > EMPTY_COLLECTION_LENGTH) {
		return {
			completeReps: reps.length - missingEvidence.length,
			missingEvidence,
			missingMetricReps: missingEvidence.length,
			status: "UNAVAILABLE",
		};
	}

	const resources = buildResourceReport(
		contract.declaredStages,
		reps,
		NO_RECORDED_GROUP_MAKESPAN_MS,
	);

	return {
		completeReps: resources.completeReps,
		elapsedMs: metricValueSummary(resources.repElapsedMs),
		missingMetricReps: NO_MISSING_METRIC_REPS,
		perRole: {
			"final-judge": resourceMetricSummary(resources.perRole["final-judge"]),
			"product-owner": resourceMetricSummary(
				resources.perRole["product-owner"],
			),
			"stage-judge": resourceMetricSummary(resources.perRole["stage-judge"]),
			worker: resourceMetricSummary(resources.perRole.worker),
		},
		status: "AVAILABLE",
		total: resourceMetricSummary(resources.total),
		workerTurns: metricValueSummary(resources.workerTurns),
	};
}

function comparisonResourceCases(
	request: Immutable<ComparisonProjectionInput>,
): readonly ComparisonResourceCase[] {
	return request.cases.map((benchmarkCase) => ({
		arms: {
			baseline: armResources(request.contract, benchmarkCase.arms.baseline),
			candidate: armResources(request.contract, benchmarkCase.arms.candidate),
			control: armResources(request.contract, benchmarkCase.arms.control),
		},
		caseId: benchmarkCase.caseId,
	}));
}

export { comparisonResourceCases as default };
