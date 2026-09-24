import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

export type ComparisonIndexResponse = InferResponseType<
	typeof apiClient.api.comparisons.$get
>;

async function fetchComparisonIndex(): Promise<ComparisonIndexResponse> {
	const response = await apiClient.api.comparisons.$get();
	if (!response.ok) {
		throw new Error("Could not load the saved comparisons");
	}

	return response.json();
}

/**
 * The saved-comparisons query, shared by the screen and the nav badge that
 * counts its readable comparisons, so both read one cache entry (SPEC.md:78).
 */
export const comparisonIndexQuery = {
	queryKey: ["comparisons"],
	queryFn: fetchComparisonIndex,
} as const;
