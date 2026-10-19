import type {
	SessionHistoryDetail,
	SessionHistoryEvent,
} from "#benchmark/session-history";

import { INCLUSIVE_LINE_RANGE_ADJUSTMENT } from "./history-request-timeline";
import { measurementLabel } from "./history-source-list";

function eventStateLabel(state: SessionHistoryEvent["state"]): string {
	return {
		delivered: "↓ Delivered",
		failed: "✕ Failed",
		invoked: "▶ Invoked",
		partial: "◐ Partial",
		recorded: "• Recorded",
		unavailable: "? Unavailable",
	}[state];
}

function detailContentHeading(detail: SessionHistoryDetail): string {
	if (detail.state === "delivered") {
		return "Observed delivery";
	}

	return detail.kind === "result" ? "Saved result content" : "Recorded content";
}

const DETAIL_SECTION_CLASSES =
	"flex flex-col gap-2 border-t border-subtle px-3 py-3";

const EVIDENCE_TEXT_CLASSES =
	"max-h-96 overflow-auto rounded-md bg-background p-2.5 font-mono text-13 leading-transcript break-words whitespace-pre-wrap text-secondary-foreground";

interface DetailPaneProps {
	readonly detail: SessionHistoryDetail;
}

function DetailPane({ detail }: DetailPaneProps): React.JSX.Element {
	const contentHeading = detailContentHeading(detail);

	return (
		<div>
			<header className="flex justify-between gap-2.5 px-3 py-2.5 text-muted-foreground">
				<code className="font-mono text-12 text-accent-foreground">{`${detail.locator.line}:${detail.locator.block}`}</code>
				<span>{eventStateLabel(detail.state)}</span>
			</header>
			<section className={DETAIL_SECTION_CLASSES}>
				<h3 className="text-14 font-medium">{contentHeading}</h3>
				<p className="text-12 text-muted-foreground">
					{measurementLabel(detail.deliveredMeasurement)}
				</p>
				{detail.deliveredText === undefined ? (
					<p>Content unavailable.</p>
				) : (
					<pre className={EVIDENCE_TEXT_CLASSES}>{detail.deliveredText}</pre>
				)}
			</section>
			<section className={DETAIL_SECTION_CLASSES}>
				<h3 className="text-14 font-medium">Structured source snapshot</h3>
				<p className="text-12 text-muted-foreground">
					{measurementLabel(detail.snapshotMeasurement)}
				</p>
				{detail.sourceSnapshotRange === undefined ? null : (
					<p className="text-12 text-muted-foreground">
						Lines {detail.sourceSnapshotRange.startLine}–
						{detail.sourceSnapshotRange.startLine +
							detail.sourceSnapshotRange.deliveredLineCount -
							INCLUSIVE_LINE_RANGE_ADJUSTMENT}{" "}
						of {detail.sourceSnapshotRange.totalLineCount} ·{" "}
						{detail.sourceSnapshotRange.coverage}
					</p>
				)}
				{detail.sourceSnapshot === undefined ? (
					<p>Snapshot unavailable.</p>
				) : (
					<pre className={EVIDENCE_TEXT_CLASSES}>{detail.sourceSnapshot}</pre>
				)}
			</section>
			{detail.applicationTruncated ? (
				<p className="px-3 py-2.5 text-12 text-muted-foreground">
					◐ Application-truncated · display capped at 65,536 UTF-8 bytes.
				</p>
			) : null}
		</div>
	);
}

interface EvidenceDetailProps {
	readonly served: boolean;
	readonly loading: boolean;
	readonly failed: boolean;
	readonly detail: SessionHistoryDetail | undefined;
}

function EvidenceDetail({
	served,
	loading,
	failed,
	detail,
}: EvidenceDetailProps): React.JSX.Element | null {
	if (!served) {
		return (
			<p className="px-3 py-2.5 text-14 text-muted-foreground">
				A replay serves no per-event evidence detail.
			</p>
		);
	}
	if (loading) {
		return (
			<p className="px-3 py-2.5 text-14 text-muted-foreground">
				Loading evidence…
			</p>
		);
	}
	if (failed) {
		return (
			<p role="alert" className="px-3 py-2.5 text-14 text-attention">
				<span aria-hidden="true">⚠ </span>
				Could not load event evidence.
			</p>
		);
	}

	return detail === undefined ? (
		<p className="px-3 py-3 text-14 text-muted-foreground">
			No event evidence is recorded for this selection.
		</p>
	) : (
		<DetailPane detail={detail} />
	);
}

export { EvidenceDetail as default };
