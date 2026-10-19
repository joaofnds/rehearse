import type {
	ComparisonContrast,
	PairedEstimate,
	SingleCaseMeanEstimate,
} from "./comparison-estimator";
import type { ComparisonArm } from "./comparison-record";

const NO_MISSING_METRIC_REPS = 0;

const RESOURCE_ROLES = [
	"worker",
	"product-owner",
	"stage-judge",
	"final-judge",
] as const;
type ResourceRole = (typeof RESOURCE_ROLES)[number];

interface MetricValueSummary {
	readonly values: readonly number[];
	readonly mean: number;
}

interface ResourceMetricSummary {
	readonly costUsd: MetricValueSummary;
	readonly inputTokens: MetricValueSummary;
	readonly outputTokens: MetricValueSummary;
	readonly cacheReadTokens: MetricValueSummary;
	readonly cacheWriteTokens: MetricValueSummary;
}

interface MissingResourceEvidence {
	readonly repId: string;
	readonly ordinal: number;
	readonly missing: readonly string[];
}

interface AvailableArmResources {
	readonly status: "AVAILABLE";
	readonly completeReps: number;
	readonly missingMetricReps: typeof NO_MISSING_METRIC_REPS;
	readonly perRole: Readonly<Record<ResourceRole, ResourceMetricSummary>>;
	readonly total: ResourceMetricSummary;
	readonly workerTurns: MetricValueSummary;
	readonly elapsedMs: MetricValueSummary;
}

interface UnavailableArmResources {
	readonly status: "UNAVAILABLE";
	readonly completeReps: number;
	readonly missingMetricReps: number;
	readonly missingEvidence: readonly MissingResourceEvidence[];
}

type ArmResources = AvailableArmResources | UnavailableArmResources;

interface ComparisonResourceCase {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ArmResources>>;
}

interface ContrastMissingResourceEvidence extends MissingResourceEvidence {
	readonly caseId: string;
	readonly arm: ComparisonArm;
}

interface AvailableContrastResources {
	readonly status: "AVAILABLE";
	readonly perRole: Readonly<Record<ResourceRole, ResourceMetricEstimates>>;
	readonly total: ResourceMetricEstimates;
	readonly workerTurns: PairedEstimate;
	readonly elapsedMs: PairedEstimate;
}

interface ResourceMetricEstimates {
	readonly costUsd: PairedEstimate;
	readonly inputTokens: PairedEstimate;
	readonly outputTokens: PairedEstimate;
	readonly cacheReadTokens: PairedEstimate;
	readonly cacheWriteTokens: PairedEstimate;
}

interface SingleCaseResourceMetricEstimates {
	readonly costUsd: SingleCaseMeanEstimate;
	readonly inputTokens: SingleCaseMeanEstimate;
	readonly outputTokens: SingleCaseMeanEstimate;
	readonly cacheReadTokens: SingleCaseMeanEstimate;
	readonly cacheWriteTokens: SingleCaseMeanEstimate;
}

interface UnavailableContrastResources {
	readonly status: "UNAVAILABLE";
	readonly missingEvidence: readonly ContrastMissingResourceEvidence[];
}

type ContrastResources =
	| AvailableContrastResources
	| UnavailableContrastResources;

interface ResourceContrastReport {
	readonly resources: ContrastResources;
}

interface AvailableSingleCaseContrastResources {
	readonly status: "AVAILABLE";
	readonly perRole: Readonly<
		Record<ResourceRole, SingleCaseResourceMetricEstimates>
	>;
	readonly total: SingleCaseResourceMetricEstimates;
	readonly workerTurns: SingleCaseMeanEstimate;
	readonly elapsedMs: SingleCaseMeanEstimate;
}

type SingleCaseContrastResources =
	| AvailableSingleCaseContrastResources
	| UnavailableContrastResources;

interface SingleCaseResourceContrastReport {
	readonly resources: SingleCaseContrastResources;
}

interface SingleCaseComparisonResourcesReport {
	readonly cases: readonly ComparisonResourceCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, SingleCaseResourceContrastReport>
	>;
}

interface ComparisonResourcesReport {
	readonly cases: readonly ComparisonResourceCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, ResourceContrastReport>
	>;
}

export type {
	ResourceRole,
	MetricValueSummary,
	ResourceMetricSummary,
	MissingResourceEvidence,
	AvailableArmResources,
	UnavailableArmResources,
	ArmResources,
	ComparisonResourceCase,
	ContrastMissingResourceEvidence,
	AvailableContrastResources,
	ResourceMetricEstimates,
	SingleCaseResourceMetricEstimates,
	UnavailableContrastResources,
	ContrastResources,
	ResourceContrastReport,
	AvailableSingleCaseContrastResources,
	SingleCaseContrastResources,
	SingleCaseResourceContrastReport,
	SingleCaseComparisonResourcesReport,
	ComparisonResourcesReport,
};
