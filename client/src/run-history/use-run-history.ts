import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { UNJUDGED_REASON } from "#server/row-staleness";
import type { RunHistoryResponse } from "./run-history-query";
import { runStalenessQuery } from "./run-history-query";
import { polledRunListingQuery } from "./run-history-polling";

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

export function useRunHistory(): ProgressiveHistory {
	const client = useQueryClient();
	const listing = useQuery(polledRunListingQuery);
	// A judgment belongs to one successful list read, even when a record keeps its ID.
	const reading =
		client.getQueryState(polledRunListingQuery.queryKey)?.dataUpdateCount ?? 0;
	const judgments = useQuery({
		...runStalenessQuery,
		queryKey: [...runStalenessQuery.queryKey, reading],
		gcTime: 0,
		enabled: listing.isSuccess && !listing.isFetching,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	const data = useMemo((): RunHistoryResponse | undefined => {
		if (listing.data === undefined) {
			return undefined;
		}

		const reason = unjudgedReason(
			judgments.isError,
			listing.isFetching ||
				judgments.isFetching ||
				judgments.data === undefined,
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
					state: "unavailable",
					reasons: [reason],
				},
			})),
		};
	}, [
		listing.data,
		listing.isFetching,
		listing.isSuccess,
		judgments.data,
		judgments.isError,
		judgments.isFetching,
	]);

	return {
		data,
		isLoading: listing.isLoading,
		isError: listing.isError,
		isSuccess: listing.isSuccess,
		freshnessPending:
			listing.isSuccess &&
			(listing.isFetching ||
				judgments.isFetching ||
				(judgments.data === undefined && !judgments.isError)),
	};
}
