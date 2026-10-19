import { useQuery } from "@tanstack/react-query";

import { runListingQuery } from "#client/run-history/run-history-query";

import { fetchStageCorpus } from "./history-evidence-queries";
import type {
	HistoryReads,
	SessionHistoryIdentity,
} from "./history-investigation-contract";
import { recordNames, runOf } from "./history-record-names";
import {
	fetchRequestSeries,
	sessionHistoryQuery,
} from "./history-report-query";

function useHistoryReads(
	identity: SessionHistoryIdentity,
	path: string,
): HistoryReads {
	const summary = useQuery(sessionHistoryQuery(identity));
	const runHistory = useQuery(runListingQuery);
	const names = recordNames(
		identity,
		runHistory.data?.rows ?? [],
		runOf(summary.data),
	);
	const recordsRequestSeries =
		identity.kind === "standalone" || identity.kind === "confirmation";
	/**
	 * The server reads a replay's summary only: no route serves one event's
	 * evidence from a replay, so the detail pane says so instead of asking.
	 */
	const servesEventDetail = identity.kind !== "replay";
	const stageCorpus = useQuery({
		enabled: identity.kind === "stage",
		queryFn: async () =>
			await (identity.kind === "stage"
				? fetchStageCorpus(identity.run, identity.stage)
				: Promise.resolve([])),
		queryKey: ["stage-corpus", path],
	});
	const requests = useQuery({
		enabled: recordsRequestSeries,
		queryFn: async () => await fetchRequestSeries(identity),
		queryKey: ["session-history-requests", path],
	});
	return {
		names,
		recordsRequestSeries,
		requests,
		servesEventDetail,
		stageCorpus,
		summary,
	};
}

export { useHistoryReads as default };
