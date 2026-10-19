import { useQuery } from "@tanstack/react-query";

import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import withinCase from "#client/within-case";

import type { GroupAttemptIndex } from "./group-attempts-query";
import groupAttemptsQuery from "./group-attempts-query";
import type { SessionHistoryIdentity } from "./session-history-page";

type SessionRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "session-attempt" }
>;

type ReplayRow = Extract<
	RunHistoryResponse["rows"][number],
	{ kind: "replay" }
>;

function attemptPath(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "standalone": {
			return `/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}`;
		}
		case "confirmation": {
			return `/groups/${encodeURIComponent(identity.groupId)}/reps/${encodeURIComponent(identity.repId)}/attempt`;
		}
		case "replay": {
			return `/replays/${encodeURIComponent(identity.lineage)}/${encodeURIComponent(identity.timestamp)}`;
		}
		case "stage": {
			return `/runs/${encodeURIComponent(identity.run)}?view=results&step=${encodeURIComponent(identity.stage)}`;
		}
		default: {
			return identity satisfies never;
		}
	}
}

function recordId(
	identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>,
): string {
	switch (identity.kind) {
		case "standalone": {
			return `attempt:session:${identity.caseId}/${identity.uuid}`;
		}
		case "confirmation": {
			return `rep:session:${identity.groupId}/${identity.repId}`;
		}
		case "replay": {
			return `attempt:stage:${identity.lineage}/${identity.timestamp}`;
		}
		default: {
			return identity satisfies never;
		}
	}
}

function attemptTitle(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "standalone": {
			return "Session attempt";
		}
		case "confirmation": {
			return "Confirmation attempt";
		}
		case "replay": {
			return "Replay attempt";
		}
		case "stage": {
			return "Pipeline step";
		}
		default: {
			return identity satisfies never;
		}
	}
}

function confirmationTitle(
	identity: Extract<SessionHistoryIdentity, { kind: "confirmation" }>,
	rows: RunHistoryResponse["rows"] | undefined,
	group: GroupAttemptIndex | undefined,
): string {
	const groupRow = rows?.find(
		(row) => row.kind === "group" && row.groupId === identity.groupId,
	);
	const rep = group?.repRecords.find((row) => row.repId === identity.repId);
	const caseId = group?.caseId ?? groupRow?.caseId;

	return `${withinCase(groupRow?.shortId ?? "Group", caseId)} · ${caseId ?? "case unavailable"} · attempt ${rep === undefined ? "ordinal unavailable" : String(rep.ordinal)}`;
}

function useAttemptTitle(identity: SessionHistoryIdentity): string {
	const history = useQuery(runHistoryQuery);
	const group = useQuery({
		...groupAttemptsQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const id = identity.kind === "stage" ? undefined : recordId(identity);
	const selectedRow = history.data?.rows.find((row) => row.recordId === id);

	switch (identity.kind) {
		case "standalone": {
			return `${withinCase(selectedRow?.shortId ?? "Session", identity.caseId)} · ${identity.caseId}`;
		}
		case "replay": {
			return selectedRow?.kind === "replay"
				? `${withinCase(selectedRow.shortId ?? "Replay", selectedRow.caseId)} · ${selectedRow.caseId ?? "case unavailable"} · ${selectedRow.stage} · replay`
				: "Replay · saved attempt";
		}
		case "confirmation": {
			return confirmationTitle(identity, history.data?.rows, group.data);
		}
		case "stage": {
			return attemptTitle(identity);
		}
		default: {
			return identity satisfies never;
		}
	}
}

export { attemptPath, recordId, useAttemptTitle };
export type { ReplayRow, SessionRow };
