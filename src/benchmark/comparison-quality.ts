import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type {
	ConfirmationReliabilityRep,
	ReliabilitySummary,
} from "./confirmation-report";
import {
	buildReliabilityReport,
	reliabilitySummaryNamed,
} from "./confirmation-report";
import type { ComparisonProjectionInput } from "./comparison-evidence";
import type {
	ComparisonContrast,
	PairedEstimate,
	SingleCaseProportionEstimate,
} from "./comparison-estimator";
import {
	buildPairedEstimate,
	buildSingleCaseProportionEstimate,
	COMPARISON_CONTRASTS,
} from "./comparison-estimator";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";

export interface ComparisonQualityCase {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, readonly ReliabilitySummary[]>>;
}

export interface QualityContrastEstimate {
	readonly name: string;
	readonly successRate: PairedEstimate;
	readonly passK: PairedEstimate;
}

export interface SingleCaseQualityContrastEstimate {
	readonly name: string;
	readonly successRate: SingleCaseProportionEstimate;
	readonly passK: {
		readonly minuend: number;
		readonly subtrahend: number;
		readonly delta: number;
	};
}

export interface QualityContrastReport {
	readonly quality: readonly QualityContrastEstimate[];
}

export interface SingleCaseQualityContrastReport {
	readonly quality: readonly SingleCaseQualityContrastEstimate[];
}

export interface ComparisonQualityReport {
	readonly cases: readonly ComparisonQualityCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, QualityContrastReport>
	>;
}

export interface SingleCaseComparisonQualityReport {
	readonly samplingUnit: "rep";
	readonly cases: readonly ComparisonQualityCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, SingleCaseQualityContrastReport>
	>;
}

export function comparisonReliabilityRep(
	contract: Immutable<ComparisonProjectionInput["contract"]>,
	rep: Immutable<ParsedConfirmationRepRecord>,
): ConfirmationReliabilityRep {
	if (contract.mode === "stage" || contract.mode === "session") {
		return {
			metricsComplete: rep.metrics.status === "COMPLETE",
			stages: rep.stages,
			finalOutcome: { status: "NOT_REACHED" },
		};
	}
	if (rep.finalOutcome.status === "NOT_APPLICABLE") {
		throw new Error("Pipeline comparison rep has no final outcome");
	}

	return {
		metricsComplete: rep.metrics.status === "COMPLETE",
		stages: rep.stages,
		finalOutcome: rep.finalOutcome,
	};
}

function armQuality(
	contract: Immutable<ComparisonProjectionInput["contract"]>,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): readonly ReliabilitySummary[] {
	const inputs = reps.map((rep) => comparisonReliabilityRep(contract, rep));
	const quality = buildReliabilityReport(contract.declaredStages, inputs);

	return contract.mode === "stage" || contract.mode === "session"
		? quality.slice(0, contract.declaredStages.length)
		: quality;
}

interface BuildQualityContrastRequest {
	readonly names: readonly string[];
	readonly cases: readonly ComparisonQualityCase[];
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

function buildQualityContrast(
	request: Immutable<BuildQualityContrastRequest>,
): QualityContrastReport {
	return {
		quality: request.names.map((name) => {
			const summaries = request.cases.map((benchmarkCase) => ({
				caseId: benchmarkCase.caseId,
				minuend: reliabilitySummaryNamed(
					benchmarkCase.arms[request.minuend],
					name,
				),
				subtrahend: reliabilitySummaryNamed(
					benchmarkCase.arms[request.subtrahend],
					name,
				),
			}));

			return {
				name,
				successRate: buildPairedEstimate(
					summaries.map(({ caseId, minuend, subtrahend }) => ({
						caseId,
						minuend: [minuend.successRate],
						subtrahend: [subtrahend.successRate],
					})),
				),
				passK: buildPairedEstimate(
					summaries.map(({ caseId, minuend, subtrahend }) => ({
						caseId,
						minuend: [minuend.passK],
						subtrahend: [subtrahend.passK],
					})),
				),
			};
		}),
	};
}

interface BuildSingleCaseQualityContrastRequest {
	readonly names: readonly string[];
	readonly benchmarkCase: ComparisonQualityCase;
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

function buildSingleCaseQualityContrast(
	request: Immutable<BuildSingleCaseQualityContrastRequest>,
): SingleCaseQualityContrastReport {
	const { benchmarkCase } = request;

	return {
		quality: request.names.map((name) => {
			const minuend = reliabilitySummaryNamed(
				benchmarkCase.arms[request.minuend],
				name,
			);
			const subtrahend = reliabilitySummaryNamed(
				benchmarkCase.arms[request.subtrahend],
				name,
			);

			return {
				name,
				successRate: buildSingleCaseProportionEstimate({ minuend, subtrahend }),
				passK: {
					minuend: minuend.passK,
					subtrahend: subtrahend.passK,
					delta: minuend.passK - subtrahend.passK,
				},
			};
		}),
	};
}

export function buildComparisonQuality(
	request: Immutable<ComparisonProjectionInput>,
): ComparisonQualityReport | SingleCaseComparisonQualityReport {
	const cases = request.cases.map((benchmarkCase) => ({
		caseId: benchmarkCase.caseId,
		arms: {
			baseline: armQuality(request.contract, benchmarkCase.arms.baseline),
			candidate: armQuality(request.contract, benchmarkCase.arms.candidate),
			control: armQuality(request.contract, benchmarkCase.arms.control),
		},
	}));
	const names = [
		...request.contract.declaredStages,
		...(request.contract.mode === "pipeline" ? ["final"] : []),
	];
	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;

	const [benchmarkCase] = cases;
	if (benchmarkCase !== undefined && cases.length === 1) {
		return {
			samplingUnit: "rep",
			cases,
			contrasts: {
				candidateMinusBaseline: buildSingleCaseQualityContrast({
					names,
					benchmarkCase,
					...candidateMinusBaseline,
				}),
				candidateMinusControl: buildSingleCaseQualityContrast({
					names,
					benchmarkCase,
					...candidateMinusControl,
				}),
				baselineMinusControl: buildSingleCaseQualityContrast({
					names,
					benchmarkCase,
					...baselineMinusControl,
				}),
			},
		};
	}

	return {
		cases,
		contrasts: {
			candidateMinusBaseline: buildQualityContrast({
				names,
				cases,
				...candidateMinusBaseline,
			}),
			candidateMinusControl: buildQualityContrast({
				names,
				cases,
				...candidateMinusControl,
			}),
			baselineMinusControl: buildQualityContrast({
				names,
				cases,
				...baselineMinusControl,
			}),
		},
	};
}
