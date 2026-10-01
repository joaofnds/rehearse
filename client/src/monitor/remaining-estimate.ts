import type { StageTimesResponse } from "./stage-times-query";

const MS_PER_MINUTE = 60_000;

export const NO_RUN_SPEND_REASON = "run spend not recorded";
export const NO_STAGE_START_REASON = "the running step's start is not recorded";
export const UNREAD_EARLIER_RUNS_REASON =
	"could not read the earlier runs of this case";

export type RemainingEstimate =
	| { readonly state: "available"; readonly ms: number; readonly usd: number }
	| { readonly state: "unavailable"; readonly reason: string };

/**
 * The time and spend left in the steps a run has not finished (doc-186
 * Decision 6): each step's median time in earlier runs of the case, the
 * running one less the time it has run so far and never below zero, so a step
 * running long adds nothing rather than taking from the steps after it. The
 * spend is that time at the run's burn rate.
 */
export function remainingEstimate(props: {
	readonly unfinished: readonly string[];
	readonly times: StageTimesResponse;
	readonly running: string;
	readonly runningElapsedMs: number | undefined;
	readonly burnPerMinute: number | undefined;
}): RemainingEstimate {
	if (props.burnPerMinute === undefined) {
		return { state: "unavailable", reason: NO_RUN_SPEND_REASON };
	}

	let ms = 0;
	for (const time of props.times.stages) {
		if (props.unfinished.includes(time.stage)) {
			if (time.state === "unavailable") {
				return { state: "unavailable", reason: time.reasons.join("; ") };
			}
			if (time.stage !== props.running) {
				ms += time.medianMs;
			} else if (props.runningElapsedMs === undefined) {
				return { state: "unavailable", reason: NO_STAGE_START_REASON };
			} else {
				ms += Math.max(0, time.medianMs - props.runningElapsedMs);
			}
		}
	}

	return {
		state: "available",
		ms,
		usd: props.burnPerMinute * (ms / MS_PER_MINUTE),
	};
}
