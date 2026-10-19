import { useQueries, useQuery } from "@tanstack/react-query";

import attemptEvidenceQuery from "#client/session-history/attempt-evidence-query";
import groupAttemptsQuery from "#client/session-history/group-attempts-query";
import Metric from "#client/system/components/metric";
import StateBadge from "#client/system/components/state-badge";
import SummaryPanel from "#client/system/components/summary-panel";

import type { GroupRow } from "./group-workspace-contract";
import {
	EMPTY_COLLECTION_LENGTH,
	NO_MISSING_ITEMS,
	SINGLE_FAILED_CHECK_COUNT,
	SINGLE_ITEM_COUNT,
} from "./group-workspace-contract";

interface SessionGroupResultsProps {
	readonly row: GroupRow;
}

function SessionGroupResults({
	row,
}: SessionGroupResultsProps): React.JSX.Element {
	const reading = useSessionAssessments(row);
	return (
		<SummaryPanel
			title="Session repetitions"
			description="Recorded outcomes use reply/transcript checks. Saved state checks remain a separate assessment."
		>
			{reading.pending ? (
				<p className="text-14 text-dim">Reading saved state checks…</p>
			) : (
				<SessionAssessmentReadings
					row={row}
					assessedCount={reading.assessedCount}
					allPassed={reading.allPassed}
					missing={reading.missing}
				/>
			)}
		</SummaryPanel>
	);
}

interface SessionAssessmentRead {
	readonly pending: boolean;
	readonly assessedCount: number;
	readonly allPassed: number;
	readonly missing: number;
}

function useSessionAssessments(row: GroupRow): SessionAssessmentRead {
	const index = useQuery(groupAttemptsQuery(row.groupId));
	const refs = index.data?.repRecords ?? row.repAttempts;
	const results = useQueries({
		queries: refs.map(({ repId }) =>
			attemptEvidenceQuery(`rep:session:${row.groupId}/${repId}`),
		),
	});
	const assessed = results.flatMap(({ data }) =>
		data?.state === "available" &&
		data.kind === "session" &&
		data.record.stateResults !== undefined &&
		data.record.stateResults.length > EMPTY_COLLECTION_LENGTH
			? [data.record]
			: [],
	);
	const allPassed = assessed.filter(
		({ stateResults }) =>
			stateResults?.every(({ status }) => status === "PASS") === true,
	).length;
	const missing = row.reps - assessed.length;
	return {
		allPassed,
		assessedCount: assessed.length,
		missing,
		pending: index.isPending || results.some(({ isPending }) => isPending),
	};
}

interface SessionRepStateProps {
	readonly groupId: string;
	readonly repId: string;
}

function SessionRepState({
	groupId,
	repId,
}: SessionRepStateProps): React.JSX.Element {
	const evidence = useQuery(
		attemptEvidenceQuery(`rep:session:${groupId}/${repId}`),
	);
	const record =
		evidence.data?.state === "available" && evidence.data.kind === "session"
			? evidence.data.record
			: undefined;
	if (
		record?.stateResults === undefined ||
		record.stateResults.length === EMPTY_COLLECTION_LENGTH
	) {
		return (
			<p className="mt-1 text-14 text-muted-foreground">
				{evidence.isLoading
					? "Reading state checks…"
					: "Saved state checks unavailable"}
			</p>
		);
	}
	const passed = record.stateResults.filter(
		({ status }) => status === "PASS",
	).length;

	return (
		<p className="mt-1">
			<StateBadge
				tone={passed < record.stateResults.length ? "negative" : "positive"}
			>
				{passed} of {record.stateResults.length} saved state checks passed
			</StateBadge>
		</p>
	);
}

interface SessionAssessmentReadingsProps {
	readonly row: GroupRow;
	readonly assessedCount: number;
	readonly allPassed: number;
	readonly missing: number;
}

function SessionAssessmentReadings({
	row,
	assessedCount,
	allPassed,
	missing,
}: SessionAssessmentReadingsProps): React.JSX.Element {
	return (
		<>
			<dl className="flex flex-wrap gap-6">
				<Metric
					label="Recorded outcome"
					value={`${String(row.successful)} of ${String(row.reps)} recorded successful on reply/transcript checks`}
					hint={`${String(row.unreadReps.length)} unread result records`}
				/>
				<Metric
					label="Saved state assessment"
					value={`${String(allPassed)} of ${String(assessedCount)} assessed attempts passed every saved state check`}
					hint={`${String(assessedCount)} of ${String(row.reps)} attempts have saved state checks`}
				/>
			</dl>

			{missing > NO_MISSING_ITEMS ? (
				<p className="mt-3 text-14 text-dim">
					{missing}{" "}
					{missing === SINGLE_ITEM_COUNT
						? "attempt unavailable"
						: "attempts unavailable"}{" "}
					or without saved state checks
				</p>
			) : null}
			{assessedCount > allPassed ? (
				<p className="mt-3 text-14">
					{assessedCount - allPassed} assessed{" "}
					{assessedCount - allPassed === SINGLE_FAILED_CHECK_COUNT
						? "attempt has"
						: "attempts have"}{" "}
					failed saved state checks. Inspect Attempts for their recorded outcome
					and evidence.
				</p>
			) : null}
		</>
	);
}

export { SessionGroupResults, SessionRepState };
