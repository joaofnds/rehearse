import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import refusalReason from "#client/refusal-reason";

type CorpusResponse = InferResponseType<typeof apiClient.api.corpus.$get>;

async function fetchCorpusReport(): Promise<CorpusResponse> {
	const response = await apiClient.api.corpus.$get();
	if (!response.ok) {
		throw new Error(
			`Could not read the corpus: ${await refusalReason(response)}`,
		);
	}

	return await response.json();
}

/**
 * The full corpus report for the corpus screen. Sidebar readers use the
 * summary below; both share the corpus invalidation prefix.
 */
const corpusQuery = {
	queryFn: fetchCorpusReport,
	queryKey: ["corpus"],
} as const;

async function fetchCorpusSummary(): Promise<
	InferResponseType<(typeof apiClient.api)["corpus-summary"]["$get"]>
> {
	const response = await apiClient.api["corpus-summary"].$get();
	if (!response.ok) {
		throw new Error(
			`Could not read the corpus: ${await refusalReason(response)}`,
		);
	}

	return await response.json();
}

/** Shares invalidation with the full report without computing record usage for the sidebar. */
const corpusSummaryQuery = {
	queryFn: fetchCorpusSummary,
	queryKey: [...corpusQuery.queryKey, "summary"],
} as const;

export { corpusQuery, corpusSummaryQuery };
export type { CorpusResponse };
