import type { ProportionInterval } from "#benchmark/comparison-estimator";
import { wilsonInterval } from "#benchmark/comparison-estimator";
import type { ComparisonArm } from "#benchmark/comparison-record";
import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { ReliabilitySummary } from "#benchmark/confirmation-report";

const NO_GRADED_OUTCOMES = 0;

const FINAL_OBSERVED_GRADE_OFFSET = -1;

const PERCENTAGE_POINTS_PER_UNIT = 100;

const LETTER_SCALE: readonly string[] = STAGE_LETTER_GRADES;

interface QualityInterval {
	readonly low: string;
	readonly high: string;
}

/** An arm that recorded nothing for the measure leaves nothing to compare. */
interface UnavailableVerdict {
	readonly kind: "unavailable";
}

type QualityVerdict =
	| UnavailableVerdict
	| { readonly kind: "insideRerunNoise" }
	| { readonly kind: "unchangedAlreadyClear" }
	| { readonly kind: "separated"; readonly arm: ComparisonArm };

interface QualityReading {
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
type QualityScale = "letters" | "successRate";

function letterSpanOf(
	summary: ReliabilitySummary,
): QualityInterval | undefined {
	const observed = LETTER_SCALE.filter(
		(grade) =>
			(summary.gradeDistribution[grade] ?? NO_GRADED_OUTCOMES) >
			NO_GRADED_OUTCOMES,
	);
	const [high] = observed;
	const low = observed.at(FINAL_OBSERVED_GRADE_OFFSET);

	return low === undefined || high === undefined ? undefined : { high, low };
}

function letterSpansOverlap(
	left: QualityInterval,
	right: QualityInterval,
): boolean {
	const leftBest = LETTER_SCALE.indexOf(left.high);
	const leftWorst = LETTER_SCALE.indexOf(left.low);
	const rightBest = LETTER_SCALE.indexOf(right.high);
	const rightWorst = LETTER_SCALE.indexOf(right.low);

	return leftBest <= rightWorst && rightBest <= leftWorst;
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
	return `${Math.round(proportion * PERCENTAGE_POINTS_PER_UNIT)}%`;
}

function successRateLabel(interval: ProportionInterval): QualityInterval {
	return { high: percent(interval.high), low: percent(interval.low) };
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
		: { arm, kind: "separated" };
}

function qualityReading(request: QualityReadingRequest): QualityReading {
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

export { qualityReading as default };
export type {
	QualityInterval,
	UnavailableVerdict,
	QualityVerdict,
	QualityReading,
	QualityScale,
};
