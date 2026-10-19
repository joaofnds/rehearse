import { Link } from "@tanstack/react-router";

import { stopTargetOf, useStop } from "#client/run-history/run-controls";
import {
	clockReading,
	liveElapsedMs,
	spendReading,
} from "#client/run-history/run-progress";
import useNow from "#client/run-history/use-now";
import ActionGroup from "#client/system/components/action-group";
import { LiveGlyph } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";

import type { PipelineRow, Step } from "./run-in-flight";
import { gradesSoFar, nameOf, nameWithinCase, stepOf } from "./run-in-flight";

const EMPTY_COLLECTION_LENGTH = 0;

const EMPTY_SPEND_FRACTION = 0;

const MAXIMUM_SPEND_FRACTION = 1;

const PERCENT_SCALE = 100;

function Separator(): React.JSX.Element {
	return (
		<span aria-hidden="true" className="hidden text-strong lg:inline">
			│
		</span>
	);
}

interface SpendReadingProps {
	readonly runSpentUsd: number | undefined;
	readonly ceilingUsd: number | undefined;
}

function SpendReading({
	runSpentUsd,
	ceilingUsd,
}: SpendReadingProps): React.JSX.Element {
	const share =
		runSpentUsd === undefined || ceilingUsd === undefined
			? EMPTY_SPEND_FRACTION
			: Math.min(MAXIMUM_SPEND_FRACTION, runSpentUsd / ceilingUsd);

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
					style={{ "--spend-share": `${String(share * PERCENT_SCALE)}%` }}
				/>
			</span>
		</span>
	);
}

interface StopControlProps {
	readonly row: PipelineRow;
}

function StopControl({ row }: StopControlProps): React.JSX.Element {
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

interface RunReadingsProps {
	readonly row: PipelineRow;
}

function RunReadings({ row }: RunReadingsProps): React.JSX.Element | null {
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
			<ActiveRunIdentity row={row} />
			<Separator />
			<ActiveStepReading stage={stage} stageState={stageState} step={step} />
			<Separator />
			<span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
				<SpendReading runSpentUsd={runSpentUsd} ceilingUsd={ceilingUsd} />
				<Separator />
				<span className="font-mono text-secondary-foreground">
					{clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs))}
				</span>
				{grades.length === EMPTY_COLLECTION_LENGTH ? null : (
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

interface ActiveRunIdentityProps {
	readonly row: PipelineRow;
}

function ActiveRunIdentity({ row }: ActiveRunIdentityProps): React.JSX.Element {
	return (
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
	);
}

interface ActiveStepReadingProps {
	readonly stage: string;
	readonly stageState: Extract<
		PipelineRow["progress"],
		{ readonly state: "running" }
	>["stageState"];
	readonly step: Step | undefined;
}

function ActiveStepReading({
	stage,
	stageState,
	step,
}: ActiveStepReadingProps): React.JSX.Element {
	return (
		<span className="min-w-0 wrap-anywhere">
			<span className="text-foreground">
				{step === undefined
					? stage
					: `step ${String(step.number)} of ${String(step.of)} · ${stage}`}
			</span>{" "}
			<span className="text-muted-foreground">{stageState}</span>
		</span>
	);
}

export { RunReadings as default };
