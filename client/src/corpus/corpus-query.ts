import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";

export type CorpusResponse = InferResponseType<
	typeof apiClient.api.corpus.$get
>;

async function fetchCorpusReport(): Promise<CorpusResponse> {
	const response = await apiClient.api.corpus.$get();
	if (!response.ok) {
		throw new Error(
			`Could not read the corpus: ${await refusalReason(response)}`,
		);
	}

	return response.json();
}

/**
 * The full corpus report for the corpus screen. Sidebar readers use the
 * summary below; both share the corpus invalidation prefix.
 */
export const corpusQuery = {
	queryKey: ["corpus"],
	queryFn: fetchCorpusReport,
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

	return response.json();
}

/** Shares invalidation with the full report without computing record usage for the sidebar. */
export const corpusSummaryQuery = {
	queryKey: [...corpusQuery.queryKey, "summary"],
	queryFn: fetchCorpusSummary,
} as const;
