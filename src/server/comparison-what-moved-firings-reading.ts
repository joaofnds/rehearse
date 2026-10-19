import { wilsonInterval } from "#benchmark/comparison-estimator";
import type { ProportionInterval } from "#benchmark/comparison-estimator";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type {
	QualityInterval,
	QualityReading,
	QualityVerdict,
} from "#server/comparison-quality-reading";
import type {
	Firings,
	ItemReading,
} from "#server/comparison-what-moved-contract";
import { intervalsOverlap } from "#server/comparison-what-moved-meter-reading";
import type { Reading } from "#server/run-record";

const NO_BLOCKER_FIRINGS = 0;

const PERCENTAGE_POINTS_PER_UNIT = 100;

function percent(proportion: number): string {
	return `${Math.round(proportion * PERCENTAGE_POINTS_PER_UNIT)}%`;
}

function firingsReading(
	minuend: Reading<Firings>,
	subtrahend: Reading<Firings>,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): ItemReading {
	if (minuend.state === "unavailable" || subtrahend.state === "unavailable") {
		return {
			interval: {
				minuend: firingInterval(minuend),
				subtrahend: firingInterval(subtrahend),
			},
			verdict: { kind: "unavailable" },
		};
	}

	const minuendRate = wilsonInterval(minuend.fired, minuend.of);
	const subtrahendRate = wilsonInterval(subtrahend.fired, subtrahend.of);

	return {
		interval: {
			minuend: rateLabel(minuendRate),
			subtrahend: rateLabel(subtrahendRate),
		},
		verdict: firingsVerdict(
			{ minuend, subtrahend },
			intervalsOverlap(minuendRate, subtrahendRate),
			arms,
		),
	};
}

function firingInterval(
	firings: Reading<Firings>,
): QualityReading["interval"]["minuend"] {
	return firings.state === "available"
		? rateLabel(wilsonInterval(firings.fired, firings.of))
		: undefined;
}

function rateLabel(interval: ProportionInterval): QualityInterval {
	return { high: percent(interval.high), low: percent(interval.low) };
}

/** A blocker fires on failure, so the arm that fires less often did better. */
function firingsVerdict(
	firings: { readonly minuend: Firings; readonly subtrahend: Firings },
	overlapping: boolean,
	arms: { readonly minuend: ComparisonArm; readonly subtrahend: ComparisonArm },
): QualityVerdict {
	if (
		firings.minuend.fired === NO_BLOCKER_FIRINGS &&
		firings.subtrahend.fired === NO_BLOCKER_FIRINGS
	) {
		return { kind: "unchangedAlreadyClear" };
	}
	if (overlapping) {
		return { kind: "insideRerunNoise" };
	}

	return {
		arm:
			firings.minuend.fired / firings.minuend.of <
			firings.subtrahend.fired / firings.subtrahend.of
				? arms.minuend
				: arms.subtrahend,
		kind: "separated",
	};
}

export { firingsReading as default };
