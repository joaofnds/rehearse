import type { ComparisonArm } from "./comparison-record";
import type {
	ComparisonResourceCase,
	ContrastMissingResourceEvidence,
	ResourceContrastReport,
	SingleCaseResourceContrastReport,
} from "./comparison-resource-contracts";
import {
	buildMetricEstimate,
	buildResourceMetricEstimates,
	buildSingleCaseMetricEstimate,
	buildSingleCaseResourceMetricEstimates,
} from "./comparison-resource-estimates";
import type { Immutable } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

interface BuildResourceContrastRequest {
	readonly cases: readonly ComparisonResourceCase[];
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

function contrastMissingEvidence(
	request: Immutable<BuildResourceContrastRequest>,
): readonly ContrastMissingResourceEvidence[] {
	const missingEvidence: ContrastMissingResourceEvidence[] = [];

	for (const benchmarkCase of request.cases) {
		for (const arm of [request.minuend, request.subtrahend]) {
			const resources = benchmarkCase.arms[arm];
			if (resources.status === "UNAVAILABLE") {
				missingEvidence.push(
					...resources.missingEvidence.map((evidence) => ({
						arm,
						caseId: benchmarkCase.caseId,
						missing: evidence.missing,
						ordinal: evidence.ordinal,
						repId: evidence.repId,
					})),
				);
			}
		}
	}

	return missingEvidence;
}

function buildSingleCaseResourceContrast(
	request: Immutable<BuildResourceContrastRequest>,
): SingleCaseResourceContrastReport {
	const missingEvidence = contrastMissingEvidence(request);
	if (missingEvidence.length > EMPTY_COLLECTION_LENGTH) {
		return { resources: { missingEvidence, status: "UNAVAILABLE" } };
	}

	const metricRequest = {
		cases: request.cases,
		minuend: request.minuend,
		subtrahend: request.subtrahend,
	};

	return {
		resources: {
			elapsedMs: buildSingleCaseMetricEstimate({
				...metricRequest,
				values: ({ elapsedMs }) => elapsedMs.values,
			}),
			perRole: {
				"final-judge": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["final-judge"],
				}),
				"product-owner": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["product-owner"],
				}),
				"stage-judge": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["stage-judge"],
				}),
				worker: buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole.worker,
				}),
			},
			status: "AVAILABLE",
			total: buildSingleCaseResourceMetricEstimates({
				...metricRequest,
				metrics: ({ total }) => total,
			}),
			workerTurns: buildSingleCaseMetricEstimate({
				...metricRequest,
				values: ({ workerTurns }) => workerTurns.values,
			}),
		},
	};
}

function buildResourceContrast(
	request: Immutable<BuildResourceContrastRequest>,
): ResourceContrastReport {
	const missingEvidence = contrastMissingEvidence(request);
	if (missingEvidence.length > EMPTY_COLLECTION_LENGTH) {
		return { resources: { missingEvidence, status: "UNAVAILABLE" } };
	}

	const metricRequest = {
		cases: request.cases,
		minuend: request.minuend,
		subtrahend: request.subtrahend,
	};

	return {
		resources: {
			elapsedMs: buildMetricEstimate({
				...metricRequest,
				values: ({ elapsedMs }) => elapsedMs.values,
			}),
			perRole: {
				"final-judge": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["final-judge"],
				}),
				"product-owner": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["product-owner"],
				}),
				"stage-judge": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["stage-judge"],
				}),
				worker: buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole.worker,
				}),
			},
			status: "AVAILABLE",
			total: buildResourceMetricEstimates({
				...metricRequest,
				metrics: ({ total }) => total,
			}),
			workerTurns: buildMetricEstimate({
				...metricRequest,
				values: ({ workerTurns }) => workerTurns.values,
			}),
		},
	};
}

export { buildSingleCaseResourceContrast, buildResourceContrast };
