import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import {
	NO_LAUNCH_REASON,
	useStopLaunch,
} from "#client/run-history/run-controls";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import { useNow } from "#client/run-history/use-now";
import { LiveGlyph } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import type { PipelineRow } from "./run-in-flight";
import {
	announcements,
	gradesSoFar,
	nameOf,
	runsInFlight,
	stepOf,
	withGradesKnownBefore,
} from "./run-in-flight";

type HistoryRow = RunListingResponse["rows"][number];

/** One array for every render before the history loads, so it reads as unchanged. */
const NO_ROWS: readonly HistoryRow[] = [];

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
	const share =
		runSpentUsd === undefined || ceilingUsd === undefined
			? 0
			: Math.min(1, runSpentUsd / ceilingUsd);

	return (
		<span className="inline-flex items-center gap-2">
			<span>
				{runSpentUsd === undefined ? (
					<>
						<span className="font-mono text-dim">—</span>
						<span className="sr-only"> run spend not recorded</span>
					</>
				) : (
					<span className="font-mono text-foreground">
						{spendReading(runSpentUsd)}
					</span>
				)}
				{ceilingUsd === undefined ? null : (
					<span className="text-dim"> / {spendReading(ceilingUsd)}</span>
				)}
			</span>
			<span
				aria-hidden="true"
				className="h-spend-track-height w-spend-track-width overflow-hidden rounded-xs border border-strong"
			>
				<span
					className="block h-full w-(--spend-share) bg-deep"
					style={{ "--spend-share": `${String(share * 100)}%` }}
				/>
			</span>
		</span>
	);
}

function StopControl({
	launchId,
}: {
	readonly launchId: string | undefined;
}): React.JSX.Element {
	const stop = useStopLaunch();
	const reasonId = useId();
	if (launchId === undefined) {
		return (
			<span className="inline-flex items-center gap-2">
				<span id={reasonId} className="text-dim">
					{NO_LAUNCH_REASON}
				</span>
				<Button
					variant="quiet"
					size="compact"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Stop
				</Button>
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-2">
			{stop.error === null ? null : (
				<span role="alert" className="text-secondary-foreground">
					{stop.error.message}
				</span>
			)}
			<Button
				variant="quiet"
				size="compact"
				disabled={stop.isPending || stop.isSuccess}
				onClick={() => {
					stop.mutate(launchId);
				}}
			>
				Stop
			</Button>
		</span>
	);
}

function RunReadings({
	row,
}: {
	readonly row: PipelineRow;
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
			aria-label={`Run ${nameOf(row)} in flight`}
			className="flex h-11.75 flex-none items-center gap-4.25 overflow-x-auto border-t border-strong bg-raised px-4 text-12 whitespace-nowrap"
		>
			<span className="text-10">
				<LiveGlyph />
			</span>
			<span className="font-mono text-pale">{nameOf(row)}</span>
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
				<span className="text-dim">grades so far {grades.join(" ")}</span>
			)}
			<span className="ml-auto inline-flex items-center gap-2.5">
				<Button asChild size="compact">
					<Link to="/monitor/$run" params={{ run: row.run }}>
						Open monitor
					</Link>
				</Button>
				<StopControl key={row.run} launchId={row.launchId} />
			</span>
		</section>
	);
}

/**
 * What a screen reader is told between readings. The earlier reading is kept
 * from the last render rather than an effect, so the message lands in the
 * same render as the readings it speaks of, and a reading that says nothing
 * new leaves the last message in place instead of clearing and repeating it.
 * A run whose latest reading could not read its stages keeps the stages last
 * read, so the next readable one does not announce them all again.
 */
function useAnnouncement(rows: readonly HistoryRow[]): string {
	const [seen, setSeen] = useState(rows);
	const [previous, setPrevious] = useState(rows);
	const [message, setMessage] = useState("");
	if (seen !== rows) {
		setSeen(rows);
		setPrevious(withGradesKnownBefore(previous, rows));
		const said = announcements(previous, rows);
		if (said.length > 0) {
			setMessage(said.join(". "));
		}
	}

	return message;
}

/**
 * One bar per run in flight, newest first. The live region stays mounted when
 * no run is in flight, since a stop is announced after the bar that showed the
 * run leaves.
 */
export function RunInFlight({
	rows,
}: {
	readonly rows: readonly HistoryRow[];
}): React.JSX.Element {
	const message = useAnnouncement(rows);

	return (
		<>
			{runsInFlight(rows).map((row) => (
				<RunReadings key={row.run} row={row} />
			))}
			<p role="status" aria-live="polite" className="sr-only">
				{message}
			</p>
		</>
	);
}

/** The runs in flight, read from the run history every screen shares. */
export function RunInFlightBar(): React.JSX.Element {
	const { data } = useQuery(polledRunListingQuery);

	return <RunInFlight rows={data?.rows ?? NO_ROWS} />;
}
