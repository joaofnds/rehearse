import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type { MetricDistributions } from "./confirmation-report";
import { buildResourceReport } from "./confirmation-report";
import type { ComparisonProjectionInput } from "./comparison-evidence";
import type {
	ComparisonContrast,
	PairedEstimate,
	SingleCaseMeanEstimate,
} from "./comparison-estimator";
import {
	buildPairedEstimate,
	buildSingleCaseMeanEstimate,
	COMPARISON_CONTRASTS,
} from "./comparison-estimator";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";

const RESOURCE_ROLES = [
	"worker",
	"product-owner",
	"stage-judge",
	"final-judge",
] as const;
type ResourceRole = (typeof RESOURCE_ROLES)[number];

export interface MetricValueSummary {
	readonly values: readonly number[];
	readonly mean: number;
}

export interface ResourceMetricSummary {
	readonly costUsd: MetricValueSummary;
	readonly inputTokens: MetricValueSummary;
	readonly outputTokens: MetricValueSummary;
	readonly cacheReadTokens: MetricValueSummary;
	readonly cacheWriteTokens: MetricValueSummary;
}

export interface MissingResourceEvidence {
	readonly repId: string;
	readonly ordinal: number;
	readonly missing: readonly string[];
}

export interface AvailableArmResources {
	readonly status: "AVAILABLE";
	readonly completeReps: number;
	readonly missingMetricReps: 0;
	readonly perRole: Readonly<Record<ResourceRole, ResourceMetricSummary>>;
	readonly total: ResourceMetricSummary;
	readonly workerTurns: MetricValueSummary;
}

export interface UnavailableArmResources {
	readonly status: "UNAVAILABLE";
	readonly completeReps: number;
	readonly missingMetricReps: number;
	readonly missingEvidence: readonly MissingResourceEvidence[];
}

export type ArmResources = AvailableArmResources | UnavailableArmResources;

export interface ComparisonResourceCase {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ArmResources>>;
}

export interface ContrastMissingResourceEvidence extends MissingResourceEvidence {
	readonly caseId: string;
	readonly arm: ComparisonArm;
}

export interface AvailableContrastResources {
	readonly status: "AVAILABLE";
	readonly perRole: Readonly<Record<ResourceRole, ResourceMetricEstimates>>;
	readonly total: ResourceMetricEstimates;
	readonly workerTurns: PairedEstimate;
}

export interface ResourceMetricEstimates {
	readonly costUsd: PairedEstimate;
	readonly inputTokens: PairedEstimate;
	readonly outputTokens: PairedEstimate;
	readonly cacheReadTokens: PairedEstimate;
	readonly cacheWriteTokens: PairedEstimate;
}

export interface SingleCaseResourceMetricEstimates {
	readonly costUsd: SingleCaseMeanEstimate;
	readonly inputTokens: SingleCaseMeanEstimate;
	readonly outputTokens: SingleCaseMeanEstimate;
	readonly cacheReadTokens: SingleCaseMeanEstimate;
	readonly cacheWriteTokens: SingleCaseMeanEstimate;
}

export interface UnavailableContrastResources {
	readonly status: "UNAVAILABLE";
	readonly missingEvidence: readonly ContrastMissingResourceEvidence[];
}

export type ContrastResources =
	| AvailableContrastResources
	| UnavailableContrastResources;

export interface ResourceContrastReport {
	readonly resources: ContrastResources;
}

export interface AvailableSingleCaseContrastResources {
	readonly status: "AVAILABLE";
	readonly perRole: Readonly<
		Record<ResourceRole, SingleCaseResourceMetricEstimates>
	>;
	readonly total: SingleCaseResourceMetricEstimates;
	readonly workerTurns: SingleCaseMeanEstimate;
}

export type SingleCaseContrastResources =
	| AvailableSingleCaseContrastResources
	| UnavailableContrastResources;

export interface SingleCaseResourceContrastReport {
	readonly resources: SingleCaseContrastResources;
}

export interface SingleCaseComparisonResourcesReport {
	readonly cases: readonly ComparisonResourceCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, SingleCaseResourceContrastReport>
	>;
}

export interface ComparisonResourcesReport {
	readonly cases: readonly ComparisonResourceCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, ResourceContrastReport>
	>;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) {
		throw new Error("A paired estimate requires observations in every arm");
	}

	const sorted = values.toSorted((left, right) => left - right);

	return sorted.reduce((total, value) => total + value, 0) / sorted.length;
}

function metricValueSummary(values: readonly number[]): MetricValueSummary {
	return { values, mean: mean(values) };
}

function resourceMetricSummary(
	distributions: Immutable<MetricDistributions>,
): ResourceMetricSummary {
	return {
		costUsd: metricValueSummary(distributions.costUsd),
		inputTokens: metricValueSummary(distributions.inputTokens),
		outputTokens: metricValueSummary(distributions.outputTokens),
		cacheReadTokens: metricValueSummary(distributions.cacheReadTokens),
		cacheWriteTokens: metricValueSummary(distributions.cacheWriteTokens),
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
						repId: rep.repId,
						ordinal: rep.ordinal,
						missing: rep.metrics.missing,
					},
				]
			: [],
	);
	if (missingEvidence.length > 0) {
		return {
			status: "UNAVAILABLE",
			completeReps: reps.length - missingEvidence.length,
			missingMetricReps: missingEvidence.length,
			missingEvidence,
		};
	}

	const resources = buildResourceReport(contract.declaredStages, reps, 0);

	return {
		status: "AVAILABLE",
		completeReps: resources.completeReps,
		missingMetricReps: 0,
		perRole: {
			worker: resourceMetricSummary(resources.perRole.worker),
			"product-owner": resourceMetricSummary(
				resources.perRole["product-owner"],
			),
			"stage-judge": resourceMetricSummary(resources.perRole["stage-judge"]),
			"final-judge": resourceMetricSummary(resources.perRole["final-judge"]),
		},
		total: resourceMetricSummary(resources.total),
		workerTurns: metricValueSummary(resources.workerTurns),
	};
}

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
		costUsd: estimate(({ costUsd }) => costUsd.values),
		inputTokens: estimate(({ inputTokens }) => inputTokens.values),
		outputTokens: estimate(({ outputTokens }) => outputTokens.values),
		cacheReadTokens: estimate(({ cacheReadTokens }) => cacheReadTokens.values),
		cacheWriteTokens: estimate(
			({ cacheWriteTokens }) => cacheWriteTokens.values,
		),
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
		costUsd: estimate(({ costUsd }) => costUsd.values),
		inputTokens: estimate(({ inputTokens }) => inputTokens.values),
		outputTokens: estimate(({ outputTokens }) => outputTokens.values),
		cacheReadTokens: estimate(({ cacheReadTokens }) => cacheReadTokens.values),
		cacheWriteTokens: estimate(
			({ cacheWriteTokens }) => cacheWriteTokens.values,
		),
	};
}

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
						caseId: benchmarkCase.caseId,
						arm,
						repId: evidence.repId,
						ordinal: evidence.ordinal,
						missing: evidence.missing,
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
	if (missingEvidence.length > 0) {
		return { resources: { status: "UNAVAILABLE", missingEvidence } };
	}

	const metricRequest = {
		cases: request.cases,
		minuend: request.minuend,
		subtrahend: request.subtrahend,
	};

	return {
		resources: {
			status: "AVAILABLE",
			perRole: {
				worker: buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole.worker,
				}),
				"product-owner": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["product-owner"],
				}),
				"stage-judge": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["stage-judge"],
				}),
				"final-judge": buildSingleCaseResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["final-judge"],
				}),
			},
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
	if (missingEvidence.length > 0) {
		return { resources: { status: "UNAVAILABLE", missingEvidence } };
	}

	const metricRequest = {
		cases: request.cases,
		minuend: request.minuend,
		subtrahend: request.subtrahend,
	};

	return {
		resources: {
			status: "AVAILABLE",
			perRole: {
				worker: buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole.worker,
				}),
				"product-owner": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["product-owner"],
				}),
				"stage-judge": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["stage-judge"],
				}),
				"final-judge": buildResourceMetricEstimates({
					...metricRequest,
					metrics: ({ perRole }) => perRole["final-judge"],
				}),
			},
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

export function buildComparisonResources(
	request: Immutable<ComparisonProjectionInput>,
): ComparisonResourcesReport | SingleCaseComparisonResourcesReport {
	const cases = request.cases.map((benchmarkCase) => ({
		caseId: benchmarkCase.caseId,
		arms: {
			baseline: armResources(request.contract, benchmarkCase.arms.baseline),
			candidate: armResources(request.contract, benchmarkCase.arms.candidate),
			control: armResources(request.contract, benchmarkCase.arms.control),
		},
	}));
	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;

	if (cases.length === 1) {
		return {
			cases,
			contrasts: {
				candidateMinusBaseline: buildSingleCaseResourceContrast({
					cases,
					...candidateMinusBaseline,
				}),
				candidateMinusControl: buildSingleCaseResourceContrast({
					cases,
					...candidateMinusControl,
				}),
				baselineMinusControl: buildSingleCaseResourceContrast({
					cases,
					...baselineMinusControl,
				}),
			},
		};
	}

	return {
		cases,
		contrasts: {
			candidateMinusBaseline: buildResourceContrast({
				cases,
				...candidateMinusBaseline,
			}),
			candidateMinusControl: buildResourceContrast({
				cases,
				...candidateMinusControl,
			}),
			baselineMinusControl: buildResourceContrast({
				cases,
				...baselineMinusControl,
			}),
		},
	};
}
