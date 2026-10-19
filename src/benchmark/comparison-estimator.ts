import type { ComparisonArm } from "./comparison-record";

const INITIAL_OBSERVATION_TOTAL = 0;

const SQUARE_EXPONENT = 2;

const SAMPLE_DEGREES_OF_FREEDOM_LOSS = 1;

const MINIMUM_VARIANCE_OBSERVATIONS = 2;

const NO_OBSERVED_VARIANCE = 0;

const MINIMUM_REQUESTED_REPS = 1;

const PROBABILITY_LOWER_BOUND = 0;

const PROBABILITY_UPPER_BOUND = 1;

const WILSON_CENTER_DIVISOR = 2;

const WILSON_NORMALIZATION_BASE = 1;

const WILSON_ROOT_CORRECTION_DIVISOR = 4;

const EMPTY_COLLECTION_LENGTH = 0;

const MINIMUM_PAIRED_CASES = 2;

interface PairedCaseObservations {
	readonly caseId: string;
	readonly minuend: readonly number[];
	readonly subtrahend: readonly number[];
}

interface ComparisonContrastDefinition {
	readonly name: string;
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
}

const COMPARISON_CONTRASTS = [
	{
		minuend: "candidate",
		name: "candidateMinusBaseline",
		subtrahend: "baseline",
	},
	{
		minuend: "candidate",
		name: "candidateMinusControl",
		subtrahend: "control",
	},
	{
		minuend: "baseline",
		name: "baselineMinusControl",
		subtrahend: "control",
	},
] as const satisfies readonly ComparisonContrastDefinition[];

type ComparisonContrast = (typeof COMPARISON_CONTRASTS)[number]["name"];

interface PairedEstimate {
	readonly caseDeltas: readonly {
		readonly caseId: string;
		readonly value: number;
	}[];
	readonly meanDelta: number;
	readonly standardError: number;
}

const WILSON_Z = 1.959963985;

interface SingleCaseArmCounts {
	readonly successful: number;
	readonly requested: number;
}

interface ProportionInterval {
	readonly low: number;
	readonly high: number;
}

interface SingleCaseArmProportion {
	readonly successful: number;
	readonly requested: number;
	readonly rate: number;
	readonly interval: ProportionInterval;
}

interface SingleCaseProportionEstimate {
	readonly minuend: SingleCaseArmProportion;
	readonly subtrahend: SingleCaseArmProportion;
	readonly delta: number;
	readonly standardError: number;
}

interface SingleCaseArmMean {
	readonly values: readonly number[];
	readonly mean: number;
}

type SingleCaseSpread =
	| { readonly status: "NO_OBSERVED_SPREAD" }
	| { readonly status: "ESTIMATED"; readonly standardError: number };

interface SingleCaseMeanEstimate {
	readonly minuend: SingleCaseArmMean;
	readonly subtrahend: SingleCaseArmMean;
	readonly delta: number;
	readonly spread: SingleCaseSpread;
}

function mean(values: readonly number[]): number {
	if (values.length === EMPTY_COLLECTION_LENGTH) {
		throw new Error("A paired estimate requires observations in every arm");
	}

	const sorted = values.toSorted((left, right) => left - right);

	return (
		sorted.reduce((total, value) => total + value, INITIAL_OBSERVATION_TOTAL) /
		sorted.length
	);
}

function buildPairedEstimate(
	cases: readonly PairedCaseObservations[],
): PairedEstimate {
	if (cases.length < MINIMUM_PAIRED_CASES) {
		throw new Error("A paired estimate requires at least two cases");
	}

	const caseDeltas = cases.map((benchmarkCase) => ({
		caseId: benchmarkCase.caseId,
		value: mean(benchmarkCase.minuend) - mean(benchmarkCase.subtrahend),
	}));
	const meanDelta = mean(caseDeltas.map(({ value }) => value));
	const squaredDifferences = caseDeltas.map(
		({ value }) => (value - meanDelta) ** SQUARE_EXPONENT,
	);
	const sampleVariance =
		mean(squaredDifferences) *
		(caseDeltas.length / (caseDeltas.length - SAMPLE_DEGREES_OF_FREEDOM_LOSS));

	return {
		caseDeltas,
		meanDelta,
		standardError: Math.sqrt(sampleVariance / caseDeltas.length),
	};
}

function wilsonInterval(
	successful: number,
	requested: number,
): ProportionInterval {
	const rate = successful / requested;
	const zSquaredOverN = WILSON_Z ** SQUARE_EXPONENT / requested;
	const center =
		(rate + zSquaredOverN / WILSON_CENTER_DIVISOR) /
		(WILSON_NORMALIZATION_BASE + zSquaredOverN);
	const halfWidth =
		(WILSON_Z *
			Math.sqrt(
				(rate * (PROBABILITY_UPPER_BOUND - rate)) / requested +
					zSquaredOverN / (WILSON_ROOT_CORRECTION_DIVISOR * requested),
			)) /
		(WILSON_NORMALIZATION_BASE + zSquaredOverN);

	return {
		high: Math.min(PROBABILITY_UPPER_BOUND, center + halfWidth),
		low: Math.max(PROBABILITY_LOWER_BOUND, center - halfWidth),
	};
}

function armProportion(counts: SingleCaseArmCounts): SingleCaseArmProportion {
	if (counts.requested < MINIMUM_REQUESTED_REPS) {
		throw new Error("A single-case estimate requires a rep in every arm");
	}

	return {
		interval: wilsonInterval(counts.successful, counts.requested),
		rate: counts.successful / counts.requested,
		requested: counts.requested,
		successful: counts.successful,
	};
}

function buildSingleCaseProportionEstimate(
	arms: Readonly<{
		minuend: SingleCaseArmCounts;
		subtrahend: SingleCaseArmCounts;
	}>,
): SingleCaseProportionEstimate {
	const minuend = armProportion(arms.minuend);
	const subtrahend = armProportion(arms.subtrahend);
	const variance =
		(minuend.rate * (PROBABILITY_UPPER_BOUND - minuend.rate)) /
			minuend.requested +
		(subtrahend.rate * (PROBABILITY_UPPER_BOUND - subtrahend.rate)) /
			subtrahend.requested;

	return {
		delta: minuend.rate - subtrahend.rate,
		minuend,
		standardError: Math.sqrt(variance),
		subtrahend,
	};
}

function armMean(values: readonly number[]): SingleCaseArmMean {
	if (values.length === EMPTY_COLLECTION_LENGTH) {
		throw new Error("A single-case estimate requires a rep in every arm");
	}

	return { mean: mean(values), values };
}

function armSampleVariance(arm: SingleCaseArmMean): number {
	if (arm.values.length < MINIMUM_VARIANCE_OBSERVATIONS) {
		return NO_OBSERVED_VARIANCE;
	}

	const squaredDifferences = arm.values.map(
		(value) => (value - arm.mean) ** SQUARE_EXPONENT,
	);

	return (
		squaredDifferences.reduce(
			(total, value) => total + value,
			INITIAL_OBSERVATION_TOTAL,
		) /
		(arm.values.length - SAMPLE_DEGREES_OF_FREEDOM_LOSS)
	);
}

function meanSpread(
	minuend: SingleCaseArmMean,
	subtrahend: SingleCaseArmMean,
): SingleCaseSpread {
	const variance =
		armSampleVariance(minuend) / minuend.values.length +
		armSampleVariance(subtrahend) / subtrahend.values.length;

	if (variance === NO_OBSERVED_VARIANCE) {
		return { status: "NO_OBSERVED_SPREAD" };
	}

	return { standardError: Math.sqrt(variance), status: "ESTIMATED" };
}

function buildSingleCaseMeanEstimate(
	arms: Readonly<{
		minuend: readonly number[];
		subtrahend: readonly number[];
	}>,
): SingleCaseMeanEstimate {
	const minuend = armMean(arms.minuend);
	const subtrahend = armMean(arms.subtrahend);

	return {
		delta: minuend.mean - subtrahend.mean,
		minuend,
		spread: meanSpread(minuend, subtrahend),
		subtrahend,
	};
}

export {
	buildPairedEstimate,
	buildSingleCaseMeanEstimate,
	buildSingleCaseProportionEstimate,
	COMPARISON_CONTRASTS,
	MINIMUM_PAIRED_CASES,
	wilsonInterval,
};
export type {
	ComparisonContrast,
	PairedCaseObservations,
	PairedEstimate,
	ProportionInterval,
	SingleCaseArmCounts,
	SingleCaseArmMean,
	SingleCaseArmProportion,
	SingleCaseMeanEstimate,
	SingleCaseProportionEstimate,
	SingleCaseSpread,
};
