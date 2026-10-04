import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { plural } from "#client/plural";
import { elapsedReading, spendReading } from "#client/run-history/run-progress";
import { Notice } from "#client/system/components/notice";
import { Button } from "#client/system/ui/button";
import type {
	AnalysisReadingResponse,
	AnalyzedStage,
	RecordedAnalysis,
} from "./analysis-query";
import { RequestAnalysisButton, requestWords } from "./analysis-request";
import { RoleMark } from "./analysis-role";
import { ReplayButton } from "./replay-button";

type MonitoredStage = RunRecordResponse["stages"][number];

const DISCLAIMER =
	"This is one agent's reading of the evidence, not a measurement. The way to confirm it is a paired rerun with that block changed and nothing else.";

const GRADE_AXIS = ["A", "B", "C", "D", "F"] as const;

function analysedAt(startedAt: string): string {
	return new Date(startedAt).toLocaleString(undefined, {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function provenance(analysis: RecordedAnalysis): string {
	return [
		"an agent read the recorded steps",
		analysis.costUsd === undefined
			? "cost not recorded"
			: spendReading(analysis.costUsd),
		elapsedReading(analysis.durationMs),
		analysedAt(analysis.startedAt),
	].join(" · ");
}

function culpritWords(culprit: RecordedAnalysis["culprit"]): string {
	if (culprit === null) {
		return "no culprit named";
	}

	return culprit.lines === undefined
		? `culprit: ${culprit.file}`
		: `culprit: ${culprit.file} · lines ${String(culprit.lines.start)}–${String(culprit.lines.end)}`;
}

/** Where a letter sits on the A to F axis, as a row of five cells. */
function gradeTrack({ grade }: MonitoredStage): string {
	const letter = grade.state === "available" ? grade.letter.charAt(0) : "";

	return GRADE_AXIS.map((axis) => (axis === letter ? "▮" : "▯")).join("");
}

function StepRow({
	run,
	stage,
	index,
	analysed,
}: {
	readonly run: string;
	readonly stage: MonitoredStage;
	readonly index: number;
	readonly analysed: AnalyzedStage | undefined;
}): React.JSX.Element {
	return (
		<li className="grid grid-cols-culprit-rows items-center gap-3 border-t border-divider py-2.5 text-12">
			<span>
				<span className="font-mono text-dim">{index + 1} </span>
				<span>{stage.stage}</span>
			</span>
			<span className="flex flex-col font-mono">
				<span>
					{stage.grade.state === "available" ? stage.grade.letter : "—"}{" "}
					<span aria-hidden="true" className="text-dim">
						{gradeTrack(stage)}
					</span>
				</span>
				<span aria-hidden="true" className="text-9 text-faint">
					{GRADE_AXIS.join(" ")}
				</span>
			</span>
			<span>
				{analysed === undefined ? (
					<span className="text-dim">not read</span>
				) : (
					<RoleMark role={analysed.role} words="shown" />
				)}
			</span>
			<span className="text-secondary-foreground">
				{analysed !== undefined && "note" in analysed ? analysed.note : null}
			</span>
			<Button asChild variant="outline" size="xs">
				<Link
					to="/runs/$run/stages/$stage"
					params={{ run, stage: stage.stage }}
				>
					Step report
				</Link>
			</Button>
		</li>
	);
}

const NO_CULPRIT = "the analysis named no culprit";

function RecordedReading({
	run,
	record,
	analysis,
	earlierCount,
	rerun,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly analysis: RecordedAnalysis;
	readonly earlierCount: number;
	readonly rerun: ReactNode;
}): React.JSX.Element {
	const { culprit } = analysis;
	const analysed = new Map(analysis.stages.map((each) => [each.stage, each]));

	return (
		<>
			<p className="mt-1 text-11-5 text-dim">{provenance(analysis)}</p>
			<p className="mt-1 font-mono text-11-5 text-pale">
				{culpritWords(culprit)}
			</p>
			<p className="mt-3 max-w-prose text-13">{analysis.narrative}</p>
			<p className="mt-2 max-w-prose text-12 text-secondary-foreground">
				{DISCLAIMER}
			</p>
			<p className="mt-2 max-w-prose text-12">
				<span className="text-dim">Paired rerun: </span>
				{analysis.pairedRerun}
			</p>
			{earlierCount === 0 ? null : (
				<p className="mt-1 text-11-5 text-dim">
					{plural(earlierCount, "earlier analysis")} recorded
				</p>
			)}
			<div className="mt-3 flex flex-wrap gap-2">
				{culprit === null ? (
					<>
						<Button
							variant="default"
							size="compact"
							aria-disabled="true"
							aria-label={`Set up the paired rerun: ${NO_CULPRIT}`}
						>
							Set up the paired rerun
						</Button>
						<Button
							variant="outline"
							size="compact"
							aria-disabled="true"
							aria-label={`Open the block it names: ${NO_CULPRIT}`}
						>
							Open the block it names
						</Button>
					</>
				) : (
					<>
						<ReplayButton
							run={run}
							record={record}
							stage={culprit.stage}
							label="Set up the paired rerun"
						/>
						<Button asChild variant="outline" size="compact">
							<Link to="/corpus">Open the block it names</Link>
						</Button>
					</>
				)}
				{rerun}
			</div>
			<ol aria-label="Steps as the analysis read them" className="mt-4">
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

/**
 * SPEC.md 4c item 3: the newest culprit analysis, disclosed as one agent's
 * reading of the recorded steps rather than a measurement.
 */
export function CulpritAnalysisSection({
	run,
	record,
	reading,
	wait,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly reading: AnalysisReadingResponse | "unreadable" | undefined;
	readonly wait: string | null;
}): React.JSX.Element {
	return (
		<section
			aria-labelledby="culprit-analysis-heading"
			className="rounded-lg border border-accent-line bg-card p-4.5"
		>
			<h2 id="culprit-analysis-heading" className="text-14 font-semibold">
				Culprit analysis
			</h2>
			{reading === "unreadable" ? (
				<p role="alert" className="mt-2 text-12 text-muted-foreground">
					<span aria-hidden="true">⚠ </span>
					Could not read the culprit analyses of this run.
				</p>
			) : null}
			{reading === undefined || reading === "unreadable" ? null : (
				<AnalysisReading
					run={run}
					record={record}
					reading={reading}
					wait={wait}
				/>
			)}
		</section>
	);
}

function AnalysisReading({
	run,
	record,
	reading,
	wait,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly reading: AnalysisReadingResponse;
	readonly wait: string | null;
}): React.JSX.Element {
	const { newest, request, unreadable } = reading;
	const rerun = (
		<RequestAnalysisButton
			run={run}
			request={request}
			wait={wait}
			label="Re-run the analysis"
		/>
	);

	function newestReading(): React.JSX.Element {
		if (newest === null) {
			return (
				<div className="mt-2 flex flex-col gap-2 text-12">
					<p className="text-muted-foreground">
						No culprit analysis is recorded for this run.
					</p>
					{requestWords(request) === undefined ? null : (
						<p className="text-secondary-foreground">{requestWords(request)}</p>
					)}
					<div>
						<RequestAnalysisButton
							run={run}
							request={request}
							wait={wait}
							label="Request a culprit analysis"
						/>
					</div>
				</div>
			);
		}
		if (newest.outcome === "failed") {
			return (
				<div className="mt-2 flex flex-col gap-2 text-12">
					<p className="text-secondary-foreground">
						The newest analysis failed: {newest.reason}
					</p>
					{newest.payload === undefined ? null : (
						<pre className="max-h-60 overflow-auto rounded-md bg-raised p-2.5 font-mono text-11-5 whitespace-pre-wrap">
							{JSON.stringify(newest.payload, null, 2)}
						</pre>
					)}
					<div>{rerun}</div>
				</div>
			);
		}

		return (
			<RecordedReading
				run={run}
				record={record}
				analysis={newest}
				earlierCount={reading.earlierCount}
				rerun={rerun}
			/>
		);
	}

	return (
		<>
			{unreadable.length === 0 ? null : (
				<div className="mt-2">
					<Notice
						message="Some analysis records could not be read"
						items={unreadable.map(({ file, reason }) => `${file}: ${reason}`)}
					/>
				</div>
			)}
			{newestReading()}
		</>
	);
}
