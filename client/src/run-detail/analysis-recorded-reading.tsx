import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { RunRecordResponse } from "#client/monitor/run-record-query";
import plural from "#client/plural";
import { Button } from "#client/system/ui/button";

import type { RecordedAnalysis } from "./analysis-query";
import {
	StepRow,
	provenance,
	rootCauseWords,
} from "./analysis-record-readings";
import ReplayButton from "./replay-button";

const NO_EARLIER_ANALYSES = 0;

const DISCLAIMER =
	"This is one agent's reading of the evidence, not a measurement. The way to confirm it is a paired rerun with that block changed and nothing else.";

const NO_ROOT_CAUSE = "the analysis named no root cause";

interface RecordedReadingProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly analysis: RecordedAnalysis;
	readonly earlierCount: number;
	readonly rerun: ReactNode;
}

function RecordedReading({
	run,
	record,
	analysis,
	earlierCount,
	rerun,
}: RecordedReadingProps): React.JSX.Element {
	const { rootCause } = analysis;
	const analysed = new Map(analysis.stages.map((each) => [each.stage, each]));

	return (
		<>
			<AnalysisNarrative analysis={analysis} earlierCount={earlierCount} />
			<AnalysisRootActions
				run={run}
				record={record}
				rootCause={rootCause}
				rerun={rerun}
			/>
			<ol
				aria-label="Steps as the analysis read them"
				className="mt-4 overflow-x-auto"
			>
				{record.stages.map((stage, index) => (
					<StepRow
						key={stage.stage}
						run={run}
						stage={stage}
						index={index}
						analysed={analysed.get(stage.stage)}
					/>
				))}
			</ol>
		</>
	);
}

interface AnalysisRootActionsProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly rootCause: RecordedAnalysis["rootCause"];
	readonly rerun: ReactNode;
}

function AnalysisRootActions({
	run,
	record,
	rootCause,
	rerun,
}: AnalysisRootActionsProps): React.JSX.Element {
	return (
		<div className="mt-3 flex flex-wrap gap-2">
			{rootCause === null ? (
				<UnavailableRootActions />
			) : (
				<>
					<ReplayButton
						run={run}
						record={record}
						stage={rootCause.stage}
						label="Set up the paired rerun"
					/>
					<Button asChild variant="outline" size="compact">
						<Link
							to="/corpus"
							search={{
								end: rootCause.lines?.end,
								file: rootCause.file,
								sourceRun: run,
								sourceStep: rootCause.stage,
								start: rootCause.lines?.start,
							}}
						>
							Open the block it names
						</Link>
					</Button>
				</>
			)}
			{rerun}
		</div>
	);
}

function UnavailableRootActions(): React.JSX.Element {
	return (
		<>
			<Button
				variant="default"
				size="compact"
				aria-disabled="true"
				aria-label={`Set up the paired rerun: ${NO_ROOT_CAUSE}`}
			>
				Set up the paired rerun
			</Button>
			<Button
				variant="outline"
				size="compact"
				aria-disabled="true"
				aria-label={`Open the block it names: ${NO_ROOT_CAUSE}`}
			>
				Open the block it names
			</Button>
		</>
	);
}

interface AnalysisNarrativeProps {
	readonly analysis: RecordedAnalysis;
	readonly earlierCount: number;
}

function AnalysisNarrative({
	analysis,
	earlierCount,
}: AnalysisNarrativeProps): React.JSX.Element {
	return (
		<>
			<p className="mt-1 text-12 text-dim">{provenance(analysis)}</p>
			<p className="mt-1 font-mono text-12 text-pale">
				{rootCauseWords(analysis.rootCause)}
			</p>
			<p className="mt-3 max-w-prose text-14 leading-reading">
				{analysis.narrative}
			</p>
			<p className="mt-2 max-w-prose text-12 text-secondary-foreground">
				{DISCLAIMER}
			</p>
			<p className="mt-2 max-w-prose text-14 leading-reading">
				<span className="text-dim">Paired rerun: </span>
				{analysis.pairedRerun}
			</p>
			{earlierCount === NO_EARLIER_ANALYSES ? null : (
				<p className="mt-1 text-12 text-dim">
					{plural(earlierCount, "earlier analysis", "earlier analyses")}{" "}
					recorded
				</p>
			)}
		</>
	);
}

export { RecordedReading as default };
