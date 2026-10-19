import type { StageTimesResponse } from "./stage-times-query";

const NO_ELAPSED_MS = 0;

const NO_SPEND_RATE_USD_PER_MINUTE = 0;

const MINIMUM_REMAINING_MS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const MS_PER_MINUTE = 60_000;

const NO_RUN_SPEND_REASON = "run spend not recorded";

const NO_STEP_LEFT_REASON = "every step has finished";

const NO_STAGE_START_REASON = "the running step's start is not recorded";

const UNREAD_EARLIER_RUNS_REASON =
	"could not read the earlier runs of this case";

type RemainingEstimate =
	| { readonly state: "available"; readonly ms: number; readonly usd: number }
	| { readonly state: "unavailable"; readonly reason: string };

/**
 * Run spend over run elapsed, both as the run measured them at its latest
 * event (doc-186 Decision 5). Dividing by the ticking clock instead would
 * show the rate falling between the run's calls while nothing was spent.
 */
function burnPerMinute(runSpentUsd: number, elapsedMs: number): number {
	return elapsedMs === NO_ELAPSED_MS
		? NO_SPEND_RATE_USD_PER_MINUTE
		: runSpentUsd / (elapsedMs / MS_PER_MINUTE);
}

/**
 * The time and spend left in the steps a run has not finished (doc-186
 * Decision 6): each step's median time in earlier runs of the case, the
 * running one less the time it has run so far and never below zero, so a step
 * running long adds nothing rather than taking from the steps after it. The
 * spend is that time at the run's burn rate.
 */
interface RemainingEstimateProps {
	readonly unfinished: readonly string[];
	readonly times: StageTimesResponse;
	readonly running: string;
	readonly runningElapsedMs: number | undefined;
	readonly burnPerMinute: number | undefined;
}

type RemainingTime =
	| Pick<
			Extract<RemainingEstimate, { readonly state: "available" }>,
			"state" | "ms"
	  >
	| Extract<RemainingEstimate, { readonly state: "unavailable" }>;

function stageRemainingTime(
	time: StageTimesResponse["stages"][number],
	props: RemainingEstimateProps,
): RemainingTime {
	if (time.state === "unavailable") {
		return { reason: time.reasons.join("; "), state: "unavailable" };
	}
	if (time.stage !== props.running) {
		return { ms: time.medianMs, state: "available" };
	}
	if (props.runningElapsedMs === undefined) {
		return { reason: NO_STAGE_START_REASON, state: "unavailable" };
	}
	return {
		ms: Math.max(MINIMUM_REMAINING_MS, time.medianMs - props.runningElapsedMs),
		state: "available",
	};
}

function remainingEstimate(props: RemainingEstimateProps): RemainingEstimate {
	if (props.burnPerMinute === undefined) {
		return { reason: NO_RUN_SPEND_REASON, state: "unavailable" };
	}
	if (props.unfinished.length === EMPTY_COLLECTION_LENGTH) {
		return { reason: NO_STEP_LEFT_REASON, state: "unavailable" };
	}
	const remaining = remainingStageTimes(props);
	if (remaining.state === "unavailable") {
		return remaining;
	}
	const { ms } = remaining;
	return {
		ms,
		state: "available",
		usd: props.burnPerMinute * (ms / MS_PER_MINUTE),
	};
}

function remainingStageTimes(props: RemainingEstimateProps): RemainingTime {
	let ms = 0;
	for (const time of props.times.stages) {
		if (props.unfinished.includes(time.stage)) {
			const remaining = stageRemainingTime(time, props);
			if (remaining.state === "unavailable") {
				return remaining;
			}
			ms += remaining.ms;
		}
	}
	return { ms, state: "available" };
}

export {
	burnPerMinute,
	NO_RUN_SPEND_REASON,
	NO_STAGE_START_REASON,
	NO_STEP_LEFT_REASON,
	remainingEstimate,
	UNREAD_EARLIER_RUNS_REASON,
};
export type { RemainingEstimate };
