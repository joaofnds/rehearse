import type { ComparisonArm } from "./comparison-record";

export interface PairedCaseObservations {
	readonly caseId: string;
	readonly minuend: readonly number[];
	readonly subtrahend: readonly number[];
}

interface ComparisonContrastDefinition {
	readonly name: string;
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

export const COMPARISON_CONTRASTS = [
	{
		name: "candidateMinusBaseline",
		minuend: "candidate",
		subtrahend: "baseline",
	},
	{
		name: "candidateMinusControl",
		minuend: "candidate",
		subtrahend: "control",
	},
	{
		name: "baselineMinusControl",
		minuend: "baseline",
		subtrahend: "control",
	},
] as const satisfies readonly ComparisonContrastDefinition[];

export type ComparisonContrast = (typeof COMPARISON_CONTRASTS)[number]["name"];

export interface PairedEstimate {
	readonly caseDeltas: readonly {
		readonly caseId: string;
		readonly value: number;
	}[];
	readonly meanDelta: number;
	readonly standardError: number;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) {
		throw new Error("A paired estimate requires observations in every arm");
	}

	const sorted = values.toSorted((left, right) => left - right);

	return sorted.reduce((total, value) => total + value, 0) / sorted.length;
}

export function buildPairedEstimate(
	cases: readonly PairedCaseObservations[],
): PairedEstimate {
	if (cases.length < 2) {
		throw new Error("A paired estimate requires at least two cases");
	}

	const caseDeltas = cases.map((benchmarkCase) => ({
		caseId: benchmarkCase.caseId,
		value: mean(benchmarkCase.minuend) - mean(benchmarkCase.subtrahend),
	}));
	const meanDelta = mean(caseDeltas.map(({ value }) => value));
	const squaredDifferences = caseDeltas.map(
		({ value }) => (value - meanDelta) ** 2,
	);
	const sampleVariance =
		mean(squaredDifferences) * (caseDeltas.length / (caseDeltas.length - 1));

	return {
		caseDeltas,
		meanDelta,
		standardError: Math.sqrt(sampleVariance / caseDeltas.length),
	};
}

const WILSON_Z = 1.959963985;

export interface SingleCaseArmCounts {
	readonly successful: number;
	readonly requested: number;
}

export interface ProportionInterval {
	readonly low: number;
	readonly high: number;
}

export interface SingleCaseArmProportion {
	readonly successful: number;
	readonly requested: number;
	readonly rate: number;
	readonly interval: ProportionInterval;
}

export interface SingleCaseProportionEstimate {
	readonly minuend: SingleCaseArmProportion;
	readonly subtrahend: SingleCaseArmProportion;
	readonly delta: number;
	readonly standardError: number;
}

function wilsonInterval(
	successful: number,
	requested: number,
): ProportionInterval {
	const rate = successful / requested;
	const zSquaredOverN = WILSON_Z ** 2 / requested;
	const center = (rate + zSquaredOverN / 2) / (1 + zSquaredOverN);
	const halfWidth =
		(WILSON_Z *
			Math.sqrt(
				(rate * (1 - rate)) / requested + zSquaredOverN / (4 * requested),
			)) /
		(1 + zSquaredOverN);

	return {
		low: Math.max(0, center - halfWidth),
		high: Math.min(1, center + halfWidth),
	};
}

function armProportion(counts: SingleCaseArmCounts): SingleCaseArmProportion {
	if (counts.requested < 1) {
		throw new Error("A single-case estimate requires a rep in every arm");
	}

	return {
		successful: counts.successful,
		requested: counts.requested,
		rate: counts.successful / counts.requested,
		interval: wilsonInterval(counts.successful, counts.requested),
	};
}

export function buildSingleCaseProportionEstimate(
	arms: Readonly<{
		minuend: SingleCaseArmCounts;
		subtrahend: SingleCaseArmCounts;
	}>,
): SingleCaseProportionEstimate {
	const minuend = armProportion(arms.minuend);
	const subtrahend = armProportion(arms.subtrahend);
	const variance =
		(minuend.rate * (1 - minuend.rate)) / minuend.requested +
		(subtrahend.rate * (1 - subtrahend.rate)) / subtrahend.requested;

	return {
		minuend,
		subtrahend,
		delta: minuend.rate - subtrahend.rate,
		standardError: Math.sqrt(variance),
	};
}
