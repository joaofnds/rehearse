import { useQuery } from "@tanstack/react-query";

import {
	elapsedReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";

import type { RemainingEstimate } from "./remaining-estimate";
import {
	UNREAD_EARLIER_RUNS_REASON,
	burnPerMinute,
	remainingEstimate,
} from "./remaining-estimate";
import type { MonitoredStage } from "./run-record-query";
import { hasEnded } from "./run-record-query";
import type { Progress } from "./spend-band";
import { Figure } from "./spend-reading";
import type { StageTimesResponse } from "./stage-times-query";
import stageTimesQuery from "./stage-times-query";

const REMAINING_STAGE_NUMBER_BASE = 1;

const ORDINAL_BASE = 1;

const FIRST_REMAINING_STAGE_INDEX = 0;

const FINAL_REMAINING_STAGE_OFFSET = -1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * The steps the estimate covers, numbered as the design labels them: it draws
 * "Remaining step 4" while step 3 of 4 runs, so the label names the unfinished
 * steps after the running one, `step 4` or `steps 3 to 4`, and the running
 * step itself once no step follows it.
 */
function stepsReading(
	stages: readonly MonitoredStage[],
	running: string,
): string {
	const unfinished = stages.flatMap((stage, index) =>
		hasEnded(stage)
			? []
			: [{ number: index + ORDINAL_BASE, stage: stage.stage }],
	);
	const after = unfinished.slice(
		unfinished.findIndex(({ stage }) => stage === running) +
			REMAINING_STAGE_NUMBER_BASE,
	);
	const numbers = (
		after.length > EMPTY_COLLECTION_LENGTH ? after : unfinished
	).map(({ number }) => number);
	const first = numbers.at(FIRST_REMAINING_STAGE_INDEX);
	const last = numbers.at(FINAL_REMAINING_STAGE_OFFSET);
	if (first === undefined || last === undefined) {
		return "";
	}

	return first === last
		? ` step ${String(first)}`
		: ` steps ${String(first)} to ${String(last)}`;
}

interface RunProgressClock {
	readonly progress: Progress;
	readonly nowMs: number;
}

/** The estimate as the run's latest readings stand now. */
function liveEstimate(
	times: StageTimesResponse,
	stages: readonly MonitoredStage[],
	{ progress, nowMs }: RunProgressClock,
): RemainingEstimate {
	const { runSpentUsd, elapsedMs, stageElapsedMs, measuredAt } = progress;

	return remainingEstimate({
		burnPerMinute:
			runSpentUsd === undefined
				? undefined
				: burnPerMinute(runSpentUsd, elapsedMs),
		running: progress.stage,
		runningElapsedMs:
			stageElapsedMs === undefined
				? undefined
				: liveElapsedMs(stageElapsedMs, measuredAt, nowMs),
		times,
		unfinished: stages
			.filter((stage) => !hasEnded(stage))
			.map(({ stage }) => stage),
	});
}

/**
 * The time and spend the steps left would take at the current rate, or why
 * there is no estimate, in the drawn figure's place at the band's right.
 */
interface RemainingFigureProps {
	readonly run: string;
	readonly stages: readonly MonitoredStage[];
	readonly progress: Progress;
	readonly nowMs: number;
}

function RemainingFigure({
	run,
	stages,
	progress,
	nowMs,
}: RemainingFigureProps): React.JSX.Element {
	const query = useQuery(stageTimesQuery(run));
	let estimate: RemainingEstimate | undefined = undefined;
	if (query.isError) {
		estimate = { reason: UNREAD_EARLIER_RUNS_REASON, state: "unavailable" };
	} else if (query.data !== undefined) {
		estimate = liveEstimate(query.data, stages, { nowMs, progress });
	}

	return (
		<Figure
			label={`Remaining${stepsReading(stages, progress.stage)}, at current rate`}
			alignEnd
		>
			{estimate?.state === "available" ? (
				<span className="font-mono text-15 text-secondary-foreground">
					≈ {spendReading(estimate.usd)} · {elapsedReading(estimate.ms)}
				</span>
			) : null}
			{estimate?.state === "unavailable" ? (
				<span>
					<span className="font-mono text-15 text-dim">—</span>
					<span className="text-12 text-dim"> {estimate.reason}</span>
				</span>
			) : null}
		</Figure>
	);
}

export { RemainingFigure as default };
