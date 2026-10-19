import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import UNJUDGED_REASON from "#server/row-staleness";

import { polledRunListingQuery } from "./run-history-polling";
import type {
	RunHistoryResponse,
	RunListingResponse,
} from "./run-history-query";
import { runStalenessQuery } from "./run-history-query";

const NO_QUERY_DATA_UPDATES = 0;

/** Saved readings render first; a corpus judgment never blocks the run list. */
interface ProgressiveHistory {
	readonly data: RunHistoryResponse | undefined;
	readonly isLoading: boolean;
	readonly isError: boolean;
	readonly isSuccess: boolean;
	readonly freshnessPending: boolean;
}

function unjudgedReason(failed: boolean, pending: boolean): string {
	if (failed) {
		return "Could not check run freshness";
	}

	return pending ? "Checking freshness…" : UNJUDGED_REASON;
}

function useRunHistory(): ProgressiveHistory {
	const client = useQueryClient();
	const listing = useQuery(polledRunListingQuery);
	// A judgment belongs to one successful list read, even when a record keeps its ID.
	const reading =
		client.getQueryState(polledRunListingQuery.queryKey)?.dataUpdateCount ??
		NO_QUERY_DATA_UPDATES;
	const judgments = useQuery({
		...runStalenessQuery,
		enabled: listing.isSuccess && !listing.isFetching,
		gcTime: 0,
		queryKey: [...runStalenessQuery.queryKey, reading],
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
	});
	const data = useMemo(
		() => judgedHistory({ judgments, listing }),
		[
			listing.data,
			listing.isFetching,
			listing.isSuccess,
			judgments.data,
			judgments.isError,
			judgments.isFetching,
		],
	);

	return {
		data,
		freshnessPending:
			listing.isSuccess &&
			(listing.isFetching ||
				judgments.isFetching ||
				(judgments.data === undefined && !judgments.isError)),
		isError: listing.isError,
		isLoading: listing.isLoading,
		isSuccess: listing.isSuccess,
	};
}

interface HistoryJudgmentRequest {
	readonly listing: {
		readonly data: RunListingResponse | undefined;
		readonly isFetching: boolean;
		readonly isSuccess: boolean;
	};
	readonly judgments: {
		readonly data:
			| Awaited<ReturnType<typeof runStalenessQuery.queryFn>>
			| undefined;
		readonly isError: boolean;
		readonly isFetching: boolean;
	};
}

function judgedHistory({
	listing,
	judgments,
}: HistoryJudgmentRequest): RunHistoryResponse | undefined {
	if (listing.data === undefined) {
		return undefined;
	}

	const reason = unjudgedReason(
		judgments.isError,
		listing.isFetching || judgments.isFetching || judgments.data === undefined,
	);

	const records =
		listing.isFetching ||
		!listing.isSuccess ||
		judgments.isError ||
		judgments.isFetching
			? undefined
			: judgments.data?.records;
	return {
		...listing.data,
		rows: listing.data.rows.map((row) => ({
			...row,
			staleness: records?.[row.recordId] ?? {
				reasons: [reason],
				state: "unavailable",
			},
		})),
	};
}

export { useRunHistory as default };
