import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type { MonitoredStage } from "#client/monitor/run-record-query";
import { runRecordQuery } from "#client/monitor/run-record-query";
import { stageCostReading } from "#client/run-detail/step-readings";
import { stageOutputQuery } from "#client/run-detail/investigation-query";
import { spendReading } from "#client/run-history/run-progress";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
	DialogClose,
	DialogTrigger,
} from "#client/system/ui/dialog";
import { SavedOutput, savedOutputInitialMode } from "./attempt-evidence";
import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import { attemptEvidenceQuery } from "./attempt-evidence-query";

type SavedStageOutput = Extract<
	AttemptEvidenceResponse,
	{ kind: "stage" }
>["output"];

type ReplayRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "replay" }
>;

function caseName(row: ReplayRow): string {
	return row.caseId ?? "Case not recorded";
}

function replayIdentity(row: ReplayRow): string {
	return `${row.shortId ?? "ID not recorded"} · ${caseName(row)} · ${row.stage}`;
}

function sourceSpend(stage: MonitoredStage | undefined): string {
	if (stage === undefined) {
		return "Cost unavailable";
	}
	return `Worker + Judge ${stageCostReading(stage)}`;
}
function replaySpend(row: ReplayRow): string {
	if (row.cost.state === "unavailable") {
		return "Cost unavailable";
	}
	return `Replay total ${spendReading(row.cost.usd)}${row.cost.missing.length === 0 ? "" : " recorded; incomplete"}`;
}
function replayOutputNote(
	output: SavedStageOutput | undefined,
): string | undefined {
	if (output?.state !== "available") {
		return output?.reason;
	}
	return output.path ?? `Saved ${output.kind}`;
}
function SourceComparisonContent({
	sourceRun,
	row,
}: {
	readonly sourceRun: string;
	readonly row: ReplayRow;
}): React.JSX.Element {
	const source = useQuery(runRecordQuery(sourceRun));
	const output = useQuery(stageOutputQuery(sourceRun, row.stage));
	const replay = useQuery(attemptEvidenceQuery(row.recordId));
	const sourceStage = source.data?.stages.find(
		(stage) => stage.stage === row.stage,
	);
	const saved = output.data?.state === "available" ? output.data : undefined;
	const replayOutput =
		replay.data?.state === "available" && replay.data.kind === "stage"
			? replay.data.output
			: undefined;
	const sourceId =
		source.data?.shortId.state === "available"
			? source.data.shortId.shortId
			: "Source run";
	const sourceGrade =
		sourceStage?.grade.state === "available"
			? `Grade ${sourceStage.grade.letter}`
			: "Grade unavailable";
	return (
		<div className="min-h-0 overflow-y-auto px-4 pb-4">
			<p className="mb-4 text-13 text-dim">
				One original execution and one replay from its checkpoint. This
				exploratory comparison has no control or repeated sample; it cannot
				attribute a difference to the corpus or establish equivalent quality.
				Source cost covers the selected worker and step Judge. Replay total also
				includes the Product Owner; its recorded parts are listed below.
			</p>
			<div className="grid items-start gap-4 lg:grid-cols-2">
				<div className="flex min-w-0 flex-col gap-3">
					<h3 className="text-14 font-medium">
						Source {sourceId} · {caseName(row)} · {row.stage}
					</h3>
					<p className="text-13">
						{source.isPending
							? "Reading saved source measurements…"
							: `${sourceGrade} · ${sourceSpend(sourceStage)} · ${corpusMeasurementReading(sourceStage?.corpusVersion)}`}
					</p>
					<SavedOutput
						title="Source saved output"
						initialMode={savedOutputInitialMode(saved)}
						text={saved?.text}
						pending={output.isPending}
						note={
							output.data?.state === "unavailable"
								? output.data.reason
								: saved?.path
						}
					/>
					<Link
						to="/runs/$run"
						params={{ run: sourceRun }}
						search={{ view: "results", step: row.stage }}
						className="text-13 text-accent-foreground underline"
					>
						Source step
					</Link>
				</div>
				<div className="flex min-w-0 flex-col gap-3">
					<h3 className="text-14 font-medium">Replay {replayIdentity(row)}</h3>
					<p className="text-13">
						Grade {row.grade} · {replaySpend(row)} ·{" "}
						{corpusMeasurementReading(row.corpusVersion)}
					</p>
					{row.cost.state === "available" ? (
						<ul className="text-12 text-dim">
							{row.cost.parts.map(({ part, usd }) => (
								<li key={part}>
									{part} · {spendReading(usd)}
								</li>
							))}
						</ul>
					) : null}
					<SavedOutput
						title="Replay saved output"
						initialMode={savedOutputInitialMode(replayOutput)}
						text={
							replayOutput?.state === "available"
								? replayOutput.text
								: undefined
						}
						pending={replay.isPending}
						note={replayOutputNote(replayOutput)}
					/>
					<details className="text-12 text-dim">
						<summary className="cursor-pointer">Replay provenance</summary>
						<code className="mt-2 block select-all wrap-anywhere">
							{row.recordId}
						</code>
					</details>
				</div>
			</div>
		</div>
	);
}
export function ReplaySourceComparison({
	sourceRun,
	row,
}: {
	readonly sourceRun: string;
	readonly row: ReplayRow;
}): React.JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">Compare with source</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<div className="flex items-start justify-between gap-4 p-4">
					<div>
						<DialogTitle>Source & replay · exploratory</DialogTitle>
						<DialogDescription>
							Compare this saved replay with the original {row.stage} step.
						</DialogDescription>
					</div>
					<DialogClose asChild>
						<Button size="sm" variant="quiet">
							Close
						</Button>
					</DialogClose>
				</div>
				{open ? (
					<SourceComparisonContent sourceRun={sourceRun} row={row} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}
