import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { StageOutputResponse } from "#client/run-detail/investigation-query";
import stageCostReading from "#client/run-detail/step-readings";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";

import { SavedOutput, savedOutputInitialMode } from "./attempt-evidence";
import type { AttemptEvidenceResponse } from "./attempt-evidence-query";

const EMPTY_COLLECTION_LENGTH = 0;

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
	return `Replay total ${spendReading(row.cost.usd)}${row.cost.missing.length === EMPTY_COLLECTION_LENGTH ? "" : " recorded; incomplete"}`;
}

function replayOutputNote(
	output: SavedStageOutput | undefined,
): string | undefined {
	if (output?.state !== "available") {
		return output?.reason;
	}
	return output.path ?? `Saved ${output.kind}`;
}

interface ReplayReadingProps {
	readonly row: ReplayRow;
	readonly replayOutput: SavedStageOutput | undefined;
	readonly pending: boolean;
}

function ReplayReading({
	row,
	replayOutput,
	pending,
}: ReplayReadingProps): React.JSX.Element {
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<h3 className="text-14 font-medium">Replay {replayIdentity(row)}</h3>
			<p className="text-14">
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
					replayOutput?.state === "available" ? replayOutput.text : undefined
				}
				pending={pending}
				note={replayOutputNote(replayOutput)}
			/>
			<details className="text-12 text-dim">
				<summary className="cursor-pointer">Replay provenance</summary>
				<code className="mt-2 block select-all wrap-anywhere">
					{row.recordId}
				</code>
			</details>
		</div>
	);
}

interface SourceRunReadingProps {
	readonly source: SourceQueryReading;
	readonly output: OutputQueryReading;
	readonly sourceRun: string;
	readonly row: ReplayRow;
}

function SourceRunReading({
	source,
	output,
	sourceRun,
	row,
}: SourceRunReadingProps): React.JSX.Element {
	const sourceStage = source.data?.stages.find(
		(stage) => stage.stage === row.stage,
	);
	const saved = output.data?.state === "available" ? output.data : undefined;
	const sourceId =
		source.data?.shortId.state === "available"
			? source.data.shortId.shortId
			: "Source run";
	const sourceGrade = sourceStageGrade(sourceStage);
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<h3 className="text-14 font-medium">
				Source {sourceId} · {caseName(row)} · {row.stage}
			</h3>
			<p className="text-14">
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
				search={{ step: row.stage, view: "results" }}
				className="text-14 text-link underline"
			>
				Source step
			</Link>
		</div>
	);
}

type SourceQueryReading = Readonly<
	Pick<UseQueryResult<RunRecordResponse>, "data" | "isPending">
>;

type OutputQueryReading = Readonly<
	Pick<UseQueryResult<StageOutputResponse>, "data" | "isPending">
>;

function sourceStageGrade(stage: MonitoredStage | undefined): string {
	return stage?.grade.state === "available"
		? `Grade ${stage.grade.letter}`
		: "Grade unavailable";
}

export { ReplayReading, SourceRunReading };
export type { ReplayRow };
