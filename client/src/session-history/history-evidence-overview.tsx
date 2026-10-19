import type { SessionHistoryReport } from "#benchmark/session-history";

import { locatorLabel } from "./history-event-ledger";
import type { RequestSeriesResponse } from "./history-report-query";
import { RequestTimelineStatus } from "./history-request-timeline";
import { RequestCostReadings } from "./request-timeline";

const EMPTY_COLLECTION_LENGTH = 0;

const INLINE_EVIDENCE_REASON_LIMIT = 3;

function reportEvidenceLabel(report: SessionHistoryReport): string {
	if (report.boundary === "unknown") {
		return report.evidence.state === "complete"
			? "? Unavailable · boundary unknown"
			: `? Unavailable · boundary unknown · ${report.evidence.reasons.join(", ")}`;
	}
	if (report.evidence.state === "unavailable") {
		return `? Unavailable · ${report.evidence.reasons.join(", ")}`;
	}
	if (report.evidence.state === "partial") {
		return `◐ Partial · ${report.evidence.reasons.join(", ")}`;
	}

	return `✓ Complete · ${report.attemptEvents.length} attempt events · ${report.sources.length} sources`;
}

interface ReportEvidenceProps {
	readonly report: SessionHistoryReport;
}

function ReportEvidence({ report }: ReportEvidenceProps): React.JSX.Element {
	if (
		report.evidence.state === "complete" ||
		report.evidence.reasons.length <= INLINE_EVIDENCE_REASON_LIMIT
	) {
		return (
			<strong
				className={`font-mono text-14 ${report.evidence.state === "complete" && report.boundary !== "unknown" ? "text-secondary-foreground" : "text-attention"}`}
			>
				{reportEvidenceLabel(report)}
			</strong>
		);
	}

	const state =
		report.evidence.state === "partial" ? "◐ Partial" : "? Unavailable";
	return (
		<details className="min-w-0 font-mono text-14 text-attention">
			<summary className="cursor-pointer">
				{report.boundary === "unknown"
					? "? Unavailable · boundary unknown"
					: state}{" "}
				· {report.evidence.reasons.length} evidence gaps
			</summary>
			<ul className="mt-2 max-h-64 list-disc overflow-y-auto pl-5 wrap-anywhere">
				{report.evidence.reasons.map((reason, index) => (
					<li key={`${index}:${reason}`}>{reason}</li>
				))}
			</ul>
		</details>
	);
}

function diagnosticLocators(
	report: SessionHistoryReport,
): readonly { readonly id: string; readonly label: string }[] {
	const { diagnostics } = report;
	if (diagnostics === undefined || diagnostics.state === "unavailable") {
		return [];
	}
	const entries = [
		...diagnostics.toolErrors.flatMap((toolError) => [
			...(toolError.call === undefined
				? []
				: [
						{
							id: `${toolError.call.line}:${toolError.call.block}`,
							label: "Tool error call",
						},
					]),
			{
				id: `${toolError.result.line}:${toolError.result.block}`,
				label: "Tool error result",
			},
		]),
		...diagnostics.repeatedBashCommands.flatMap((command) =>
			command.occurrences.map(({ location }) => ({
				id: `${location.line}:${location.block}`,
				label: "Repeated Bash command",
			})),
		),
		...diagnostics.issues.flatMap((issue) =>
			issue.locations.map((location) => ({
				id: `${location.line}:${location.block}`,
				label: issue.kind,
			})),
		),
	];
	const seen = new Set<string>();

	return entries.filter(({ id }) => {
		if (seen.has(id)) {
			return false;
		}
		seen.add(id);

		return true;
	});
}

interface ScopeReadingsProps {
	readonly report: SessionHistoryReport;
	readonly requests: RequestSeriesResponse | undefined;
	readonly requestsFailed: boolean;
	readonly recorded: boolean;
	readonly showRequestStatus: boolean;
}

function ScopeReadings({
	report,
	requests,
	requestsFailed,
	recorded,
	showRequestStatus,
}: ScopeReadingsProps): React.JSX.Element {
	return (
		<section
			aria-label="Selected scope readings"
			className="flex flex-col gap-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 text-14">
				<span>
					Saved evidence · {report.attempt.caseId}
					{report.attempt.kind === "session"
						? " / attempt"
						: ` / ${report.attempt.stage}`}
				</span>
				<ReportEvidence report={report} />
			</div>
			{report.attempt.kind === "stopped-stage" ? (
				<p className="text-14 text-secondary-foreground">
					Stopped because {report.attempt.error}
				</p>
			) : null}
			{requests === undefined ? null : (
				<RequestCostReadings cost={requests.cost} />
			)}
			{requests === undefined && showRequestStatus ? (
				<RequestTimelineStatus failed={requestsFailed} recorded={recorded} />
			) : null}
		</section>
	);
}

interface TranscriptDiagnosticsProps {
	readonly report: SessionHistoryReport;
	readonly onSelect: (id: string) => void;
}

function TranscriptDiagnostics({
	report,
	onSelect,
}: TranscriptDiagnosticsProps): React.JSX.Element | null {
	const diagnostics = diagnosticLocators(report);
	return diagnostics.length === EMPTY_COLLECTION_LENGTH ? null : (
		<nav aria-label="Transcript diagnostics" className="flex flex-wrap gap-2">
			{diagnostics.map((entry) => (
				<button
					key={entry.id}
					type="button"
					className="rounded-md border px-3 py-2 text-14 text-secondary-foreground hover:bg-accent"
					onClick={() => {
						onSelect(entry.id);
					}}
				>
					{entry.id} · {entry.label}
				</button>
			))}
		</nav>
	);
}

interface StartingContextProps {
	readonly report: SessionHistoryReport;
}

function StartingContext({ report }: StartingContextProps): React.JSX.Element {
	return (
		<details className="rounded-lg border bg-muted px-4 py-3 text-secondary-foreground">
			<summary className="cursor-pointer text-14">
				Starting context · {report.startingContext.length} events ·{" "}
				{report.boundary === "unknown" ? "Boundary unknown" : "known boundary"}
			</summary>
			<section
				aria-label="Starting context"
				className="mt-3 flex flex-col gap-1"
			>
				{report.startingContext.map((event) => (
					<p key={event.id} className="text-14">
						<code className="font-mono text-accent-foreground">
							{locatorLabel(event)}
						</code>{" "}
						{event.label}
					</p>
				))}
			</section>
		</details>
	);
}

export {
	EMPTY_COLLECTION_LENGTH,
	ScopeReadings,
	StartingContext,
	TranscriptDiagnostics,
};
