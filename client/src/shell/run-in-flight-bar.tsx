import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { stopTargetOf, useStop } from "#client/run-history/run-controls";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import { useNow } from "#client/run-history/use-now";
import { LiveGlyph } from "#client/system/components/status";
import { ActionGroup } from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";
import type { PipelineRow } from "./run-in-flight";
import {
	announcements,
	gradesSoFar,
	nameOf,
	nameWithinCase,
	runsInFlight,
	stepOf,
	withGradesKnownBefore,
} from "./run-in-flight";

type HistoryRow = RunListingResponse["rows"][number];

/** One array for every render before the history loads, so it reads as unchanged. */
const NO_ROWS: readonly HistoryRow[] = [];

function Separator(): React.JSX.Element {
	return (
		<span aria-hidden="true" className="hidden text-strong lg:inline">
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
	row,
}: {
	readonly row: PipelineRow;
}): React.JSX.Element {
	const stop = useStop();

	return (
		<span className="inline-flex min-w-0 flex-wrap items-center gap-2">
			{stop.error === null ? null : (
				<span role="alert" className="basis-full text-attention wrap-anywhere">
					{stop.error.message}
				</span>
			)}
			<Button
				variant="destructive"
				size="compact"
				disabled={stop.isPending || stop.isSuccess}
				onClick={() => {
					stop.mutate(stopTargetOf(row.launchId, row.run));
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
			className="relative flex min-h-touch-target min-w-0 flex-none flex-wrap items-center gap-x-4.25 gap-y-2 border-t border-strong bg-raised px-4 py-3 text-12"
		>
			<span className="flex min-w-0 w-full items-center gap-3 lg:w-auto lg:flex-1">
				<span className="shrink-0">
					<LiveGlyph />
				</span>
				<span className="shrink-0 font-mono text-pale">
					{nameWithinCase(row)}
				</span>
				<span
					className="min-w-0 truncate text-secondary-foreground"
					title={row.caseId}
				>
					{row.caseId}
				</span>
			</span>
			<Separator />
			<span className="min-w-0 wrap-anywhere">
				<span className="text-foreground">
					{step === undefined
						? stage
						: `step ${String(step.number)} of ${String(step.of)} · ${stage}`}
				</span>{" "}
				<span className="text-muted-foreground">{stageState}</span>
			</span>
			<Separator />
			<span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
				<SpendReading runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
				<Separator />
				<span className="font-mono text-secondary-foreground">
					{clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
				</span>
				{grades.length === 0 ? null : (
					<span className="text-dim">grades so far {grades.join(" ")}</span>
				)}
			</span>
			<ActionGroup className="ml-auto">
				<Button asChild size="compact">
					<Link
						to="/runs/$run"
						params={{ run: row.run }}
						search={{ view: "activity" }}
					>
						Open activity
					</Link>
				</Button>
				<StopControl key={row.run} row={row} />
			</ActionGroup>
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
	const running = runsInFlight(rows);

	return (
		<>
			{running.length === 0 ? null : (
				<section
					aria-label="Active runs"
					tabIndex={0}
					className="relative max-h-1/4 shrink-0 overflow-y-auto overscroll-y-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					{running.map((row) => (
						<RunReadings key={row.run} row={row} />
					))}
				</section>
			)}
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
