import type {
	ComparisonContrast,
	PairedEstimate,
	SingleCaseProportionEstimate,
} from "./comparison-estimator";
import {
	COMPARISON_CONTRASTS,
	buildPairedEstimate,
	buildSingleCaseProportionEstimate,
} from "./comparison-estimator";
import type { ComparisonProjectionInput } from "./comparison-evidence";
import type { ComparisonArm } from "./comparison-record";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type {
	ConfirmationReliabilityRep,
	ReliabilitySummary,
} from "./confirmation-report";
import {
	buildReliabilityReport,
	reliabilitySummaryNamed,
} from "./confirmation-report";
import type { Immutable } from "./contracts";

const PREFIX_START_INDEX = 0;

const SINGLE_ITEM_COUNT = 1;

interface ComparisonQualityCase {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, readonly ReliabilitySummary[]>>;
}

interface QualityContrastEstimate {
	readonly name: string;
	readonly successRate: PairedEstimate;
	readonly passK: PairedEstimate;
}

interface SingleCaseQualityContrastEstimate {
	readonly name: string;
	readonly successRate: SingleCaseProportionEstimate;
	readonly passK: {
		readonly minuend: number;
		readonly subtrahend: number;
		readonly delta: number;
	};
}

interface QualityContrastReport {
	readonly quality: readonly QualityContrastEstimate[];
}

interface SingleCaseQualityContrastReport {
	readonly quality: readonly SingleCaseQualityContrastEstimate[];
}

interface ComparisonQualityReport {
	readonly cases: readonly ComparisonQualityCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, QualityContrastReport>
	>;
}

interface SingleCaseComparisonQualityReport {
	readonly samplingUnit: "rep";
	readonly cases: readonly ComparisonQualityCase[];
	readonly contrasts: Readonly<
		Record<ComparisonContrast, SingleCaseQualityContrastReport>
	>;
}

function comparisonReliabilityRep(
	contract: Immutable<ComparisonProjectionInput["contract"]>,
	rep: Immutable<ParsedConfirmationRepRecord>,
): ConfirmationReliabilityRep {
	if (contract.mode === "stage" || contract.mode === "session") {
		return {
			finalOutcome: { status: "NOT_REACHED" },
			metricsComplete: rep.metrics.status === "COMPLETE",
			stages: rep.stages,
		};
	}
	if (rep.finalOutcome.status === "NOT_APPLICABLE") {
		throw new Error("Pipeline comparison rep has no final outcome");
	}

	return {
		finalOutcome: rep.finalOutcome,
		metricsComplete: rep.metrics.status === "COMPLETE",
		stages: rep.stages,
	};
}

function armQuality(
	contract: Immutable<ComparisonProjectionInput["contract"]>,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): readonly ReliabilitySummary[] {
	const inputs = reps.map((rep) => comparisonReliabilityRep(contract, rep));
	const quality = buildReliabilityReport(contract.declaredStages, inputs);

	return contract.mode === "stage" || contract.mode === "session"
		? quality.slice(PREFIX_START_INDEX, contract.declaredStages.length)
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
				passK: buildPairedEstimate(
					summaries.map(({ caseId, minuend, subtrahend }) => ({
						caseId,
						minuend: [minuend.passK],
						subtrahend: [subtrahend.passK],
					})),
				),
				successRate: buildPairedEstimate(
					summaries.map(({ caseId, minuend, subtrahend }) => ({
						caseId,
						minuend: [minuend.successRate],
						subtrahend: [subtrahend.successRate],
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
				passK: {
					delta: minuend.passK - subtrahend.passK,
					minuend: minuend.passK,
					subtrahend: subtrahend.passK,
				},
				successRate: buildSingleCaseProportionEstimate({ minuend, subtrahend }),
			};
		}),
	};
}

interface SingleCaseQualityRequest {
	readonly cases: readonly ComparisonQualityCase[];
	readonly names: readonly string[];
	readonly benchmarkCase: ComparisonQualityCase;
}

function singleCaseQualityReport(
	request: Immutable<SingleCaseQualityRequest>,
): SingleCaseComparisonQualityReport {
	const { cases, names, benchmarkCase } = request;
	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;

	return {
		cases,
		contrasts: {
			baselineMinusControl: buildSingleCaseQualityContrast({
				benchmarkCase,
				names,
				...baselineMinusControl,
			}),
			candidateMinusBaseline: buildSingleCaseQualityContrast({
				benchmarkCase,
				names,
				...candidateMinusBaseline,
			}),
			candidateMinusControl: buildSingleCaseQualityContrast({
				benchmarkCase,
				names,
				...candidateMinusControl,
			}),
		},
		samplingUnit: "rep",
	};
}

function buildComparisonQuality(
	request: Immutable<ComparisonProjectionInput>,
): ComparisonQualityReport | SingleCaseComparisonQualityReport {
	const cases = request.cases.map((benchmarkCase) => ({
		arms: {
			baseline: armQuality(request.contract, benchmarkCase.arms.baseline),
			candidate: armQuality(request.contract, benchmarkCase.arms.candidate),
			control: armQuality(request.contract, benchmarkCase.arms.control),
		},
		caseId: benchmarkCase.caseId,
	}));
	const names = [
		...request.contract.declaredStages,
		...(request.contract.mode === "pipeline" ? ["final"] : []),
	];
	const [benchmarkCase] = cases;
	if (benchmarkCase !== undefined && cases.length === SINGLE_ITEM_COUNT) {
		return singleCaseQualityReport({ benchmarkCase, cases, names });
	}

	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;

	return {
		cases,
		contrasts: {
			baselineMinusControl: buildQualityContrast({
				cases,
				names,
				...baselineMinusControl,
			}),
			candidateMinusBaseline: buildQualityContrast({
				cases,
				names,
				...candidateMinusBaseline,
			}),
			candidateMinusControl: buildQualityContrast({
				cases,
				names,
				...candidateMinusControl,
			}),
		},
	};
}

export { comparisonReliabilityRep, buildComparisonQuality };
export type {
	ComparisonQualityCase,
	QualityContrastEstimate,
	SingleCaseQualityContrastEstimate,
	QualityContrastReport,
	SingleCaseQualityContrastReport,
	ComparisonQualityReport,
	SingleCaseComparisonQualityReport,
};
