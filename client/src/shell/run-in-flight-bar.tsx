import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { RunControls } from "#client/run-history/run-controls";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import { useNow } from "#client/run-history/use-now";
import { Status } from "#client/system/components/status";
import type { PipelineRow } from "./run-in-flight";
import {
	announcements,
	gradesSoFar,
	runsInFlight,
	stepOf,
} from "./run-in-flight";

type HistoryRow = RunHistoryResponse["rows"][number];

/** One array for every render before the history loads, so it reads as unchanged. */
const NO_ROWS: readonly HistoryRow[] = [];

/**
 * Stop reaches a run only through the launch that started it. Whether a run
 * started from a terminal should be stoppable here is doc-186 Decision 9,
 * unsettled, so until it is answered the bar says why Stop is absent.
 */
const NO_LAUNCH_REASON =
	"started outside the browser, so it stops only where it was started";

function Separator(): React.JSX.Element {
	return (
		<span aria-hidden="true" className="text-strong">
			│
		</span>
	);
}

function SpendReading({
	runSpentUsd,
	ceilingUsd,
}: {
	readonly runSpentUsd: number | undefined;
	readonly ceilingUsd: number | undefined;
}): React.JSX.Element {
	if (runSpentUsd === undefined || ceilingUsd === undefined) {
		return <span className="text-dim">run spend not recorded</span>;
	}

	const share = Math.min(1, runSpentUsd / ceilingUsd);

	return (
		<span className="inline-flex items-center gap-2">
			<span>
				<span className="font-mono text-foreground">
					{spendReading(runSpentUsd)}
				</span>{" "}
				<span className="text-dim">/ {spendReading(ceilingUsd)}</span>
			</span>
			<span
				role="meter"
				aria-label="run spend against its ceiling"
				aria-valuemin={0}
				aria-valuemax={ceilingUsd}
				aria-valuenow={runSpentUsd}
				className="h-1.25 w-19 overflow-hidden rounded-sm border border-strong"
			>
				<span
					className="block h-full w-(--spend-share) bg-deep"
					style={{ "--spend-share": `${String(share * 100)}%` }}
				/>
			</span>
		</span>
	);
}

function RunReadings({
	row,
	others,
}: {
	readonly row: PipelineRow;
	readonly others: number;
}): React.JSX.Element | null {
	const nowMs = useNow(true);
	if (row.progress.state !== "running") {
		return null;
	}

	const { stage, stageState, elapsedMs, measuredAt, runSpentUsd, ceilingUsd } =
		row.progress;
	const step = stepOf(row);
	const grades = gradesSoFar(row);

	return (
		<section
			aria-label="Run in flight"
			className="sticky bottom-0 flex min-h-9.5 flex-wrap items-center gap-x-3 gap-y-1 border-t border-strong bg-raised px-4 py-1.5 text-xs"
		>
			<span className="text-accent-foreground">
				<Status state="running" />
			</span>
			<span className="font-mono text-pale">{row.shortId ?? row.run}</span>
			<span className="text-secondary-foreground">{row.caseId}</span>
			<Separator />
			<span>
				<span className="text-foreground">
					{step === undefined
						? stage
						: `step ${String(step.number)} of ${String(step.of)} · ${stage}`}
				</span>{" "}
				<span className="text-muted-foreground">{stageState}</span>
			</span>
			<Separator />
			<SpendReading runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
			<Separator />
			<span className="font-mono text-secondary-foreground">
				{clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
			</span>
			{grades.length === 0 ? null : (
				<>
					<Separator />
					<span className="text-dim">grades so far {grades.join(" ")}</span>
				</>
			)}
			{others === 0 ? null : (
				<Link to="/" className="text-accent-foreground underline">
					+{others} running
				</Link>
			)}
			<span className="ml-auto">
				{row.launchId === undefined ? (
					<span className="text-dim">{NO_LAUNCH_REASON}</span>
				) : (
					<RunControls launchId={row.launchId} run={undefined} />
				)}
			</span>
		</section>
	);
}

/**
 * What a screen reader is told between readings. The earlier reading is kept
 * from the last render rather than an effect, so the message lands in the
 * same render as the readings it speaks of, and a reading that says nothing
 * new leaves the last message in place instead of clearing and repeating it.
 */
function useAnnouncement(rows: readonly HistoryRow[]): string {
	const [previous, setPrevious] = useState(rows);
	const [message, setMessage] = useState("");
	if (previous !== rows) {
		setPrevious(rows);
		const said = announcements(previous, rows);
		if (said.length > 0) {
			setMessage(said.join(". "));
		}
	}

	return message;
}

/**
 * The newest run in flight, with a count of any others linking to the list
 * that shows them all. The live region stays mounted when no run is in
 * flight, since a stop is announced after the bar that showed the run leaves.
 */
export function RunInFlight({
	rows,
}: {
	readonly rows: readonly HistoryRow[];
}): React.JSX.Element {
	const message = useAnnouncement(rows);
	const [newest, ...others] = runsInFlight(rows);

	return (
		<>
			{newest === undefined ? null : (
				<RunReadings row={newest} others={others.length} />
			)}
			<p role="status" aria-live="polite" className="sr-only">
				{message}
			</p>
		</>
	);
}

/** The run in flight, read from the run history every screen shares. */
export function RunInFlightBar(): React.JSX.Element {
	const { data } = useQuery(polledRunHistoryQuery);

	return <RunInFlight rows={data?.rows ?? NO_ROWS} />;
}
