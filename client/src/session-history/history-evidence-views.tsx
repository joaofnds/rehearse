import type {
	SessionHistoryReport,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";

import AgentsSection from "./history-agent-evidence";
import EvidenceDetail from "./history-evidence-detail";
import type {
	HistoryReads,
	InvestigationControls,
	SelectedEvidence,
	SessionHistoryIdentity,
} from "./history-investigation-contract";
import {
	RequestTimelinePane,
	eventForRequestRow,
} from "./history-request-timeline";
import PaneHeading from "./pane-heading";
import { requestRowId } from "./request-timeline";

interface HistoryEvidenceViewsProps {
	readonly report: SessionHistoryReport;
	readonly identity: SessionHistoryIdentity;
	readonly path: string;
	readonly reads: HistoryReads;
	readonly controls: InvestigationControls;
	readonly evidence: SelectedEvidence;
}

function HistoryEvidenceViews({
	report,
	identity,
	path,
	reads,
	controls,
	evidence,
}: HistoryEvidenceViewsProps): React.JSX.Element {
	return (
		<div className="min-w-0 flex-1">
			<div hidden={controls.view !== "Evidence"}>
				<aside aria-label="Event detail">
					<PaneHeading>Evidence detail</PaneHeading>
					<EvidenceDetail
						served={reads.servesEventDetail}
						loading={evidence.detail.isLoading}
						failed={evidence.detail.isError}
						detail={evidence.detail.data}
					/>
				</aside>
			</div>
			{controls.view === "Requests" ? (
				<div>
					<RequestTimelinePane
						read={reads.requests.data}
						failed={reads.requests.isError}
						recorded={reads.recordsRequestSeries}
						entries={evidence.visibleEntries}
						selected={evidence.selectedRequestRow}
						onSelect={(entry) => {
							selectRequestEntry({ controls, evidence, report }, entry);
						}}
					/>
				</div>
			) : null}
			<div hidden={controls.view !== "Agents"}>
				<AgentsSection
					identity={identity}
					path={path}
					recorded={reads.recordsRequestSeries}
					sourceId={controls.sourceId}
					onSelectSource={(id) => {
						controls.setSourceId(id);
						controls.setSelectedRequestId(undefined);
					}}
				/>
			</div>
		</div>
	);
}

function selectRequestEntry(
	context: Pick<HistoryEvidenceViewsProps, "report" | "controls" | "evidence">,
	entry: SessionHistoryRequestEntry,
): void {
	const { report, controls, evidence } = context;
	controls.setSelectedRequestId(requestRowId(entry));
	const all =
		report.boundary === "unknown"
			? report.boundaryUnknown
			: report.attemptEvents;
	const target = eventForRequestRow(evidence.timelineEntries, all, entry);
	if (target !== undefined) {
		if (!evidence.events.some((event) => event.id === target.id)) {
			controls.setSourceId(undefined);
			controls.setEventQuery("");
			controls.setEventFilter("All records");
		}
		controls.setSelectedEventId(target.id);
	}
}

export { HistoryEvidenceViews as default };
