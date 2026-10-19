import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import type { Immutable } from "#benchmark/contracts";

import { savedRecordQuery } from "./attempt-evidence";
import attemptEvidenceQuery from "./attempt-evidence-query";
import { recordId } from "./attempt-record-identity";
import type { ResultsContentProps } from "./attempt-results-content";
import type { ConfirmationRepResult } from "./confirmation-rep-query";
import confirmationRepQuery from "./confirmation-rep-query";
import type { SessionHistoryIdentity } from "./session-history-page";

function useHasSessionAssessment(
	identity: Exclude<SessionHistoryIdentity, { kind: "stage" }>,
	mode: ConfirmationRepResult["mode"] | undefined,
): boolean {
	const session =
		identity.kind === "standalone" ||
		(identity.kind === "confirmation" && mode === "session");
	const evidence = useQuery({
		...attemptEvidenceQuery(recordId(identity)),
		enabled: session,
	});
	if (!session || evidence.isError) {
		return false;
	}
	return (
		evidence.data?.state === "available" && evidence.data.kind === "session"
	);
}

interface ResultRecord {
	readonly recordOpen: boolean;
	readonly setRecordOpen: Dispatch<SetStateAction<boolean>>;
	readonly id: string;
	readonly repResult: Readonly<
		Pick<
			UseQueryResult<Immutable<ConfirmationRepResult>>,
			"data" | "isLoading" | "isError"
		>
	>;
	readonly hasSessionAssessment: boolean;
	readonly parsedNonSession: boolean;
	readonly raw: Readonly<
		Pick<UseQueryResult<string>, "data" | "isLoading" | "isError">
	>;
}

function useResultRecord(
	identity: ResultsContentProps["identity"],
): ResultRecord {
	const [recordOpen, setRecordOpen] = useState(false);
	const id = recordId(identity);
	const repResult = useQuery({
		...confirmationRepQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
			identity.kind === "confirmation" ? identity.repId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const hasSessionAssessment = useHasSessionAssessment(
		identity,
		repResult.data?.mode,
	);
	const parsedNonSession =
		identity.kind === "confirmation" &&
		repResult.data !== undefined &&
		repResult.data.mode !== "session";
	const raw = useQuery({
		...savedRecordQuery(id),
		enabled:
			recordOpen &&
			(identity.kind !== "confirmation" || repResult.data?.mode === "session"),
	});
	return {
		hasSessionAssessment,
		id,
		parsedNonSession,
		raw,
		recordOpen,
		repResult,
		setRecordOpen,
	};
}

export { useResultRecord as default };
export type { ResultRecord };
