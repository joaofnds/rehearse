import type { RunHistoryResponse } from "#client/run-history/run-history-query";

import { attemptPath } from "./attempt-record-identity";
import type { GroupAttemptIndex } from "./group-attempts-query";
import type { SessionHistoryIdentity } from "./session-history-page";

const FIRST_STAGE_POSITION = 0;

const PREVIOUS_ELEMENT_OFFSET = 1;

const MISSING_SEQUENCE_INDEX = -1;

const NEXT_SEQUENCE_ELEMENT_OFFSET = 1;

interface SiblingAttempt {
	readonly path: string;
	readonly label: string;
	readonly caseId?: string | undefined;
}

function attemptSiblings(
	identity: SessionHistoryIdentity,
	groupRecord: GroupAttemptIndex | undefined,
	rows: RunHistoryResponse["rows"] | undefined,
): readonly SiblingAttempt[] {
	return identity.kind === "confirmation"
		? (groupRecord?.repRecords
				.toSorted((left, right) => left.ordinal - right.ordinal)
				.map((rep) => ({
					caseId: groupRecord.caseId,
					label: `Repetition ${String(rep.ordinal)}`,
					path: attemptPath({
						groupId: identity.groupId,
						kind: "confirmation",
						repId: rep.repId,
					}),
				})) ?? [])
		: listedAttemptSiblings(identity, rows);
}

function attemptScope(identity: SessionHistoryIdentity): string {
	switch (identity.kind) {
		case "confirmation": {
			return "Within this group";
		}
		case "standalone": {
			return "Within this case";
		}
		case "replay": {
			return "Within this saved input";
		}
		case "stage": {
			return "Within this workflow";
		}
		default: {
			return identity satisfies never;
		}
	}
}

function listedAttemptSiblings(
	identity: SessionHistoryIdentity,
	rows: RunHistoryResponse["rows"] | undefined,
): readonly SiblingAttempt[] {
	return (
		rows
			?.flatMap((row) => {
				if (
					identity.kind === "standalone" &&
					row.kind === "session-attempt" &&
					row.caseId === identity.caseId
				) {
					return [
						{
							caseId: row.caseId,
							label: row.shortId ?? "Session attempt",
							path: attemptPath({
								caseId: row.caseId,
								kind: "standalone",
								uuid: row.uuid,
							}),
						},
					];
				}
				if (
					identity.kind === "replay" &&
					row.kind === "replay" &&
					row.lineage === identity.lineage
				) {
					return [
						{
							label: row.shortId ?? "Replay",
							path: attemptPath({
								kind: "replay",
								lineage: row.lineage,
								timestamp: row.timestamp,
							}),
							...(row.caseId !== undefined && { caseId: row.caseId }),
						},
					];
				}
				return [];
			})
			.toReversed() ?? []
	);
}

export {
	attemptScope,
	attemptSiblings,
	FIRST_STAGE_POSITION,
	MISSING_SEQUENCE_INDEX,
	NEXT_SEQUENCE_ELEMENT_OFFSET,
	PREVIOUS_ELEMENT_OFFSET,
};
export type { SiblingAttempt };
