import { useState } from "react";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { hasRunEnded } from "#client/run-history/run-status";

import type { AnalysisReadingResponse } from "./analysis-query";
import { rolesOf } from "./analysis-query";
import { analysisWait } from "./analysis-request";
import RecordLedger from "./record-ledger";
import RootCauseAnalysisSection from "./root-cause-analysis-section";
import type { PipelineRow } from "./run-record-readings";
import { humanReviewReading } from "./run-record-readings";
import RunSetup from "./run-setup";
import StepMap from "./step-map";

interface WorkflowRecordProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly analysis: AnalysisReadingResponse | "unreadable" | undefined;
	readonly initiallyOpen: boolean;
}

function WorkflowRecord({
	row,
	record,
	analysis,
	initiallyOpen,
}: WorkflowRecordProps): React.JSX.Element {
	const [expanded, setExpanded] = useState(initiallyOpen);
	return (
		<details
			open={expanded}
			onToggle={(event) => {
				setExpanded(event.currentTarget.open);
			}}
			className="rounded-lg border border-border"
		>
			<summary className="cursor-pointer px-4 py-3 text-14 text-muted-foreground">
				Whole workflow record &amp; analysis map
			</summary>
			{expanded ? (
				<>
					<div className="px-4 py-3">
						<StepMap
							record={record}
							roles={rolesOf(analysis === "unreadable" ? undefined : analysis)}
						/>
					</div>
					<RecordLedger row={row} record={record} />
				</>
			) : null}
		</details>
	);
}

interface HumanReviewProps {
	readonly record: RunRecordResponse;
}

function HumanReview({ record }: HumanReviewProps): React.JSX.Element {
	const reading = record.humanReview;
	return (
		<section
			aria-label="Human review"
			className="rounded-lg border border-border p-4"
		>
			<h2 className="text-16 font-semibold">Human review</h2>
			{reading?.state === "available" ? (
				<>
					<p className="mt-2 font-mono text-14">{reading.review.verdict}</p>
					<p className="mt-1 whitespace-pre-wrap text-14 leading-reading text-secondary-foreground">
						{reading.review.summary}
					</p>
					<ul className="mt-3 flex flex-col gap-3 text-14 leading-reading">
						{reading.review.findings.map((finding, index) => (
							<li key={index}>
								<p>{finding.description}</p>
								<p className="mt-1 text-12 text-dim">
									{finding.stage} · {finding.judgeAssessment}
									{finding.rubricId === null ? "" : ` · ${finding.rubricId}`}
								</p>
								<p className="font-mono text-12 wrap-anywhere text-muted-foreground">
									{finding.paths.join(", ")}
								</p>
							</li>
						))}
					</ul>
				</>
			) : (
				<p className="mt-2 text-14 text-attention">
					{reading?.reasons.join("; ") ??
						"Human review is unavailable in this record"}
				</p>
			)}
		</section>
	);
}

interface RunHumanReviewProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

function RunHumanReview({
	row,
	record,
}: RunHumanReviewProps): React.JSX.Element {
	return (
		<details className="rounded-lg border border-border">
			<summary className="cursor-pointer px-4 py-3 text-14">
				Human review · {humanReviewReading(row, record)}
			</summary>
			<HumanReview record={record} />
		</details>
	);
}

interface RunAnalysisReviewProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly analysis: WorkflowRecordProps["analysis"];
	readonly analysisInFlight: boolean;
}

function RunAnalysisReview({
	row,
	record,
	analysis,
	analysisInFlight,
}: RunAnalysisReviewProps): React.JSX.Element {
	return (
		<details className="rounded-lg border border-border">
			<summary className="cursor-pointer px-4 py-3 text-14">
				Root-cause analysis · agent opinion
			</summary>
			<RootCauseAnalysisSection
				run={row.run}
				record={record}
				reading={analysis}
				wait={analysisWait({
					analysisInFlight,
					runEnded: hasRunEnded(row),
				})}
			/>
		</details>
	);
}

interface RunSetupDisclosureProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
}

function RunSetupDisclosure({
	row,
	record,
	selected,
}: RunSetupDisclosureProps): React.JSX.Element {
	return (
		<details className="rounded-lg border border-border">
			<summary className="cursor-pointer px-4 py-3 text-14 text-muted-foreground">
				Run setup & provenance
			</summary>
			<RunSetup row={row} record={record} selected={selected} />
		</details>
	);
}

export {
	RunAnalysisReview,
	RunHumanReview,
	RunSetupDisclosure,
	WorkflowRecord,
};
