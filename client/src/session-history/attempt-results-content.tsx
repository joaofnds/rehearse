import { useQuery } from "@tanstack/react-query";

import { runHistoryQuery } from "#client/run-history/run-history-query";

import {
	ConfirmationResults,
	ReplayResults,
	SessionResults,
} from "./attempt-measurements";
import type { ReplayRow, SessionRow } from "./attempt-record-identity";
import ResultsEvidence from "./attempt-results-evidence";
import SavedRecord from "./attempt-saved-record";
import type { SessionHistoryIdentity } from "./session-history-page";
import type { ResultRecord } from "./use-attempt-result-record";
import useResultRecord from "./use-attempt-result-record";

interface StandalonePanelProps {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "standalone" }>;
	readonly assessmentAvailable: boolean;
}

function StandalonePanel({
	identity,
	assessmentAvailable,
}: StandalonePanelProps): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const row = history.data?.rows.find(
		(candidate): candidate is SessionRow =>
			candidate.kind === "session-attempt" &&
			candidate.caseId === identity.caseId &&
			candidate.uuid === identity.uuid,
	);
	if (history.isLoading) {
		return <p className="text-12 text-dim">Loading attempt result…</p>;
	}
	if (history.isError) {
		return (
			<p role="alert" className="text-12 text-dim">
				Could not load saved run listing.
			</p>
		);
	}
	return row === undefined ? (
		<p className="text-12 text-dim">
			This saved attempt has no readable result in Runs.
		</p>
	) : (
		<SessionResults row={row} assessmentAvailable={assessmentAvailable} />
	);
}

interface ReplayPanelProps {
	readonly identity: Extract<SessionHistoryIdentity, { kind: "replay" }>;
}

function ReplayPanel({ identity }: ReplayPanelProps): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const row = history.data?.rows.find(
		(candidate): candidate is ReplayRow =>
			candidate.kind === "replay" &&
			candidate.lineage === identity.lineage &&
			candidate.timestamp === identity.timestamp,
	);
	if (history.isLoading) {
		return <p className="text-12 text-dim">Loading replay result…</p>;
	}
	if (history.isError) {
		return (
			<p role="alert" className="text-12 text-dim">
				Could not load saved run listing.
			</p>
		);
	}
	return row === undefined ? (
		<p className="text-12 text-dim">
			This saved replay has no readable result in Runs.
		</p>
	) : (
		<ReplayResults
			row={row}
			lineage={identity.lineage}
			timestamp={identity.timestamp}
		/>
	);
}

interface ResultsContentProps {
	readonly identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>;
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function ResultsContent({
	identity,
	step,
	comparison,
}: ResultsContentProps): React.JSX.Element {
	const record = useResultRecord(identity);

	return (
		<div className="flex flex-col gap-4 page-gutter py-5">
			{identity.kind === "standalone" ? (
				<StandalonePanel
					identity={identity}
					assessmentAvailable={record.hasSessionAssessment}
				/>
			) : null}
			{identity.kind === "replay" ? <ReplayPanel identity={identity} /> : null}
			{identity.kind === "confirmation" ? (
				<ConfirmationResults
					record={record.repResult.data}
					loading={record.repResult.isLoading}
					error={record.repResult.isError}
					sessionAssessmentAvailable={record.hasSessionAssessment}
				/>
			) : null}
			<ResultsEvidence
				identity={identity}
				record={record.repResult.data}
				step={step}
				comparison={comparison}
			/>
			<ResultRecordDisclosure identity={identity} record={record} />
		</div>
	);
}

interface ResultRecordDisclosureProps {
	readonly identity: ResultsContentProps["identity"];
	readonly record: ResultRecord;
}

function ResultRecordDisclosure({
	identity,
	record,
}: ResultRecordDisclosureProps): React.JSX.Element {
	return (
		<SavedRecord
			id={
				record.parsedNonSession && identity.kind === "confirmation"
					? `${identity.groupId}/${identity.repId} · server-parsed result`
					: record.id
			}
			label={
				record.parsedNonSession
					? "parsed saved result JSON"
					: "saved record JSON"
			}
			open={record.recordOpen}
			onToggle={() => {
				record.setRecordOpen((current) => !current);
			}}
			raw={
				record.parsedNonSession
					? JSON.stringify(record.repResult.data)
					: record.raw.data
			}
			loading={
				record.parsedNonSession
					? record.repResult.isLoading
					: record.raw.isLoading
			}
			error={
				record.parsedNonSession ? record.repResult.isError : record.raw.isError
			}
		/>
	);
}

export { ResultsContent as default };
export type { ResultsContentProps };
