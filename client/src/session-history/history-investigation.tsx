import type { SessionHistoryReport } from "#benchmark/session-history";
import Switcher from "#client/system/components/switcher";

import DeclaredCorpusPane from "./history-declared-corpus";
import HistoryEventsPane from "./history-evidence-browser";
import {
	ScopeReadings,
	StartingContext,
	TranscriptDiagnostics,
} from "./history-evidence-overview";
import type { StageCorpusResponse } from "./history-evidence-queries";
import HistoryEvidenceViews from "./history-evidence-views";
import type {
	HistoryReads,
	InvestigationControls,
	SelectedEvidence,
	SessionHistoryIdentity,
} from "./history-investigation-contract";
import EVIDENCE_VIEWS from "./history-investigation-contract";
import {
	HistorySourceFilters,
	HistorySourceResults,
} from "./history-source-browser";
import { selectEvidenceEvent } from "./use-investigation-selection";

interface HistoryInvestigationProps {
	readonly report: SessionHistoryReport;
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly reads: HistoryReads;
	readonly controls: InvestigationControls;
	readonly evidence: SelectedEvidence;
	readonly revealEvents: boolean;
}

function HistoryInvestigation({
	report,
	identity,
	path,
	reads,
	controls,
	evidence,
	revealEvents,
}: HistoryInvestigationProps): React.JSX.Element {
	return (
		<section
			aria-label="Context investigation"
			className="overflow-hidden rounded-lg border bg-card"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5">
				<h2 className="text-16 font-semibold">Investigate saved evidence</h2>
				<Switcher
					label="Evidence view"
					options={EVIDENCE_VIEWS}
					selected={controls.view}
					onSelect={controls.setView}
				/>
			</div>
			<div className="flex flex-col md:flex-row">
				<div className="min-w-0 border-b md:w-80 md:shrink-0 md:border-r md:border-b-0">
					<HistorySourceFilters controls={controls} />
					<HistorySourceResults report={report} controls={controls} />
					<HistoryEventsPane
						report={report}

						controls={controls}
						evidence={evidence}
						revealEvents={revealEvents}
					/>
				</div>
				<HistoryEvidenceViews
					report={report}
					identity={identity}
					path={path}
					reads={reads}
					controls={controls}
					evidence={evidence}
				/>
			</div>
		</section>
	);
}

interface HistoryWorkspaceReadingsProps {
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly reads: HistoryReads;
	readonly controls: InvestigationControls;
	readonly evidence: SelectedEvidence;
	readonly revealEvents: boolean;
}

function HistoryWorkspaceReadings({
	identity,
	path,
	reads,
	controls,
	evidence,
	revealEvents,
}: HistoryWorkspaceReadingsProps): React.JSX.Element {
	return (
		<div className="flex flex-1 flex-col gap-4 page-gutter pt-8 pb-12">
			{reads.summary.isLoading ? (
				<p className="text-muted-foreground">Loading history…</p>
			) : null}
			{reads.summary.isError ? (
				<p role="alert" className="text-attention">
					<span aria-hidden="true">⚠ </span>
					Could not load saved history.
				</p>
			) : null}
			{reads.summary.data === undefined ? null : (
				<>
					<ScopeReadings
						report={reads.summary.data}
						requests={reads.requests.data}
						requestsFailed={reads.requests.isError}
						showRequestStatus={controls.view !== "Requests"}
						recorded={reads.recordsRequestSeries}
					/>
					<HistoryInvestigation
						report={reads.summary.data}
						identity={identity}
						path={path}
						reads={reads}
						controls={controls}
						evidence={evidence}
						revealEvents={revealEvents}
					/>
					<HistoryTranscriptAppendix
						report={reads.summary.data}
						controls={controls}
						corpus={reads.stageCorpus.data}
					/>
				</>
			)}
		</div>
	);
}

interface HistoryTranscriptAppendixProps {
	readonly report: SessionHistoryReport;
	readonly controls: InvestigationControls;
	readonly corpus: StageCorpusResponse | undefined;
}

function HistoryTranscriptAppendix({
	report,
	controls,
	corpus,
}: HistoryTranscriptAppendixProps): React.JSX.Element {
	return (
		<>
			<TranscriptDiagnostics
				report={report}
				onSelect={(id) => {
					controls.setSourceId(undefined);
					controls.setEventQuery("");
					controls.setEventFilter("All records");
					selectEvidenceEvent(controls, id);
					controls.setView("Evidence");
				}}
			/>
			<StartingContext report={report} />
			{corpus === undefined ? null : <DeclaredCorpusPane entries={corpus} />}
		</>
	);
}

export { HistoryWorkspaceReadings as default };
