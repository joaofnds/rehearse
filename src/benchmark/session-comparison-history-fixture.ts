import type {
	ComparisonAttemptHistoryLink,
	ComparisonAttemptHistoryLinks,
} from "#server/comparison-history-links";

import type { ComparisonArm } from "./comparison-record";
import {
	FIRST_REP_ORDINAL,
	SECOND_REP_ORDINAL,
} from "./session-comparison-test-contract";

const availableRepLinks = (
	caseId: string,
	role: ComparisonArm,
): ComparisonAttemptHistoryLink[] =>
	[FIRST_REP_ORDINAL, SECOND_REP_ORDINAL].map((ordinal) => ({
		groupId: `${caseId}-${role}`,
		href: `/groups/${caseId}-${role}/reps/${caseId}-${role}-rep-${ordinal}/attempt`,
		ordinal,
		repId: `${caseId}-${role}-rep-${ordinal}`,
		status: "available",
	}));

interface LinkFixtureInput {
	readonly groupId: string;
	readonly groupOrdinal: number;
	readonly ordinal: number;
}

const link = ({
	groupId,
	groupOrdinal,
	ordinal,
}: LinkFixtureInput): ComparisonAttemptHistoryLink => ({
	groupId,
	href: `/groups/${groupId}/reps/${groupId}-rep-${groupOrdinal}/attempt`,
	ordinal,
	repId: `${groupId}-rep-${groupOrdinal}`,
	status: "available",
});

function everyRepAvailable(
	caseIds: readonly string[],
): ComparisonAttemptHistoryLinks {
	return Object.fromEntries(
		caseIds.map((caseId) => [
			caseId,
			{
				baseline: availableRepLinks(caseId, "baseline"),
				candidate: availableRepLinks(caseId, "candidate"),
				control: availableRepLinks(caseId, "control"),
			},
		]),
	);
}

export { availableRepLinks, link, everyRepAvailable };

export type { LinkFixtureInput };
