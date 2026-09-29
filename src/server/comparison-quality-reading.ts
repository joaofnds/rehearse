import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { ProportionInterval } from "#benchmark/comparison-estimator";
import { wilsonInterval } from "#benchmark/comparison-estimator";

const LETTER_SCALE: readonly string[] = STAGE_LETTER_GRADES;

export interface QualityInterval {
	readonly low: string;
	readonly high: string;
}

/** An arm that recorded nothing for the measure leaves nothing to compare. */
export interface UnavailableVerdict {
	readonly kind: "unavailable";
}

export type QualityVerdict =
	| UnavailableVerdict
	| { readonly kind: "insideRerunNoise" }
	| { readonly kind: "unchangedAlreadyClear" }
	| { readonly kind: "separated"; readonly arm: ComparisonArm };

export interface QualityReading {
	readonly interval: {
		readonly minuend: QualityInterval | undefined;
		readonly subtrahend: QualityInterval | undefined;
	};
	readonly verdict: QualityVerdict;
}

interface QualityReadingRequest {
	readonly minuend: ReliabilitySummary;
	readonly subtrahend: ReliabilitySummary;
	readonly minuendArm: ComparisonArm;
	readonly subtrahendArm: ComparisonArm;
	readonly scale: QualityScale;
}

/**
 * `letters` reads a stage grade's observed letter span. `successRate` reads a
 * pass/fail measure, a session's checks or a pipeline's final verdict, whose
 * observed span is the whole scale whenever an arm holds both outcomes.
 */
export type QualityScale = "letters" | "successRate";

function letterSpanOf(
	summary: ReliabilitySummary,
): QualityInterval | undefined {
	const observed = LETTER_SCALE.filter(
		(grade) => (summary.gradeDistribution[grade] ?? 0) > 0,
	);
	const [low] = observed;
	const high = observed.at(-1);

	return low === undefined || high === undefined ? undefined : { low, high };
}

function letterSpansOverlap(
	left: QualityInterval,
	right: QualityInterval,
): boolean {
	const leftLow = LETTER_SCALE.indexOf(left.low);
	const leftHigh = LETTER_SCALE.indexOf(left.high);
	const rightLow = LETTER_SCALE.indexOf(right.low);
	const rightHigh = LETTER_SCALE.indexOf(right.high);

	return leftLow <= rightHigh && rightLow <= leftHigh;
}

function successRateIntervalOf(
	summary: ReliabilitySummary,
): ProportionInterval {
	return wilsonInterval(summary.successful, summary.requested);
}

function successRateIntervalsOverlap(
	left: ProportionInterval,
	right: ProportionInterval,
): boolean {
	return left.low <= right.high && right.low <= left.high;
}

function percent(proportion: number): string {
	return `${Math.round(proportion * 100)}%`;
}

function successRateLabel(interval: ProportionInterval): QualityInterval {
	return { low: percent(interval.low), high: percent(interval.high) };
}

function atCeiling(summary: ReliabilitySummary): boolean {
	return summary.successful === summary.requested;
}

function higherSucceedingArm(
	request: QualityReadingRequest,
): ComparisonArm | undefined {
	const minuendRate = request.minuend.successful / request.minuend.requested;
	const subtrahendRate =
		request.subtrahend.successful / request.subtrahend.requested;

	if (minuendRate === subtrahendRate) {
		return undefined;
	}

	return minuendRate > subtrahendRate
		? request.minuendArm
		: request.subtrahendArm;
}

function verdictFor(
	request: QualityReadingRequest,
	overlapping: boolean,
): QualityVerdict {
	if (atCeiling(request.minuend) && atCeiling(request.subtrahend)) {
		return { kind: "unchangedAlreadyClear" };
	}
	if (overlapping) {
		return { kind: "insideRerunNoise" };
	}

	const arm = higherSucceedingArm(request);

	return arm === undefined
		? { kind: "insideRerunNoise" }
		: { kind: "separated", arm };
}

export function qualityReading(request: QualityReadingRequest): QualityReading {
	if (request.scale === "successRate") {
		const minuend = successRateIntervalOf(request.minuend);
		const subtrahend = successRateIntervalOf(request.subtrahend);

		return {
			interval: {
				minuend: successRateLabel(minuend),
				subtrahend: successRateLabel(subtrahend),
			},
			verdict: verdictFor(
				request,
				successRateIntervalsOverlap(minuend, subtrahend),
			),
		};
	}

	const minuendSpan = letterSpanOf(request.minuend);
	const subtrahendSpan = letterSpanOf(request.subtrahend);
	const interval = { minuend: minuendSpan, subtrahend: subtrahendSpan };

	if (minuendSpan === undefined || subtrahendSpan === undefined) {
		return { interval, verdict: { kind: "unavailable" } };
	}

	return {
		interval,
		verdict: verdictFor(
			request,
			letterSpansOverlap(minuendSpan, subtrahendSpan),
		),
	};
}
