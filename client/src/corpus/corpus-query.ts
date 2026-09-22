import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

export type CorpusResponse = InferResponseType<
	typeof apiClient.api.corpus.$get
>;

async function fetchCorpusReport(): Promise<CorpusResponse> {
	const response = await apiClient.api.corpus.$get();

	return response.json();
}

/**
 * The corpus query, shared by the screen, the nav badge that counts its files
 * and the sidebar's corpus card, so all three read one cache entry
 * (SPEC.md:78).
 */
export const corpusQuery = {
	queryKey: ["corpus"],
	queryFn: fetchCorpusReport,
} as const;
