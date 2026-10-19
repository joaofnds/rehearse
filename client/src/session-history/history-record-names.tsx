import type { SessionHistoryReport } from "#benchmark/session-history";
import type { AttemptPosition } from "#client/attempt-label";
import type { RunListingResponse } from "#client/run-history/run-history-query";

import type { SessionHistoryIdentity } from "./history-investigation-contract";

type HistoryRow = RunListingResponse["rows"][number];

/** What run history calls the record a page shows. */
interface RecordNames {
	readonly shortId: string | undefined;
	/** A replay's source run, which the page names beside the replay itself. */
	readonly runShortId: string | undefined;
	readonly checkpointShortId: string | undefined;
	readonly attempt: AttemptPosition | undefined;
}

const UNNAMED: RecordNames = {
	attempt: undefined,
	checkpointShortId: undefined,
	runShortId: undefined,
	shortId: undefined,
};

type RunRow = Extract<HistoryRow, { kind: "run" }>;

type ReplayRow = Extract<HistoryRow, { kind: "replay" }>;

type SessionAttemptRow = Extract<HistoryRow, { kind: "session-attempt" }>;

type GroupRow = Extract<HistoryRow, { kind: "group" }>;

/**
 * The shell loads the record listing on every page, so a page reads its
 * record's names from that listing rather than asking its own route to name
 * it again.
 * A stage page's checkpoint is the one the stage recorded; a replay's is the
 * one it started from.
 */
function recordNames(
	identity: SessionHistoryIdentity,
	rows: readonly HistoryRow[],
	sourceRun: string | undefined,
): RecordNames {
	switch (identity.kind) {
		case "stage": {
			const row = rows.find(
				(candidate): candidate is RunRow =>
					candidate.kind === "run" && candidate.run === identity.run,
			);

			return {
				...UNNAMED,
				checkpointShortId: row?.checkpoints.find(
					({ stage }) => stage === identity.stage,
				)?.shortId,
				shortId: row?.shortId,
			};
		}
		case "replay": {
			return replayRecordNames(identity, rows, sourceRun);
		}
		case "standalone": {
			return standaloneRecordNames(identity, rows);
		}

		case "confirmation": {
			const row = rows.find(
				(candidate): candidate is GroupRow =>
					candidate.kind === "group" && candidate.groupId === identity.groupId,
			);

			return {
				...UNNAMED,
				attempt: row?.repAttempts.find(({ repId }) => repId === identity.repId)
					?.attempt,
				shortId: row?.shortId,
			};
		}
		default: {
			return identity satisfies never;
		}
	}
}

/**
 * The run a stage report names, which a session attempt and a report still
 * loading have none of.
 */
function runOf(report: SessionHistoryReport | undefined): string | undefined {
	return report === undefined || report.attempt.kind === "session"
		? undefined
		: report.attempt.run;
}

function replayRecordNames(
	identity: Extract<SessionHistoryIdentity, { kind: "replay" }>,
	rows: readonly HistoryRow[],
	sourceRun: string | undefined,
): RecordNames {
	const row = rows.find(
		(candidate): candidate is ReplayRow =>
			candidate.kind === "replay" &&
			candidate.lineage === identity.lineage &&
			candidate.timestamp === identity.timestamp,
	);

	return row === undefined
		? UNNAMED
		: {
				attempt: row.attempt,
				checkpointShortId: row.checkpointShortId,
				runShortId: rows.find(
					(candidate): candidate is RunRow =>
						candidate.kind === "run" && candidate.run === sourceRun,
				)?.shortId,
				shortId: row.shortId,
			};
}

function standaloneRecordNames(
	identity: Extract<SessionHistoryIdentity, { kind: "standalone" }>,
	rows: readonly HistoryRow[],
): RecordNames {
	const row = rows.find(
		(candidate): candidate is SessionAttemptRow =>
			candidate.kind === "session-attempt" &&
			candidate.caseId === identity.caseId &&
			candidate.uuid === identity.uuid,
	);

	return { ...UNNAMED, shortId: row?.shortId };
}

export { recordNames, runOf };
export type { RecordNames };
