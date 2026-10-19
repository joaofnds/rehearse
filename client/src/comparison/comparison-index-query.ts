import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";

type ComparisonIndexResponse = InferResponseType<
	typeof apiClient.api.comparisons.$get
>;

async function fetchComparisonIndex(): Promise<ComparisonIndexResponse> {
	const response = await apiClient.api.comparisons.$get();
	if (!response.ok) {
		throw new Error("Could not load the saved comparisons");
	}

	return await response.json();
}

/**
 * The saved-comparisons query, shared by the screen and the nav badge that
 * counts its readable comparisons, so both read one cache entry (SPEC.md:78).
 */
const comparisonIndexQuery = {
	queryFn: fetchComparisonIndex,
	queryKey: ["comparisons"],
} as const;

export { comparisonIndexQuery as default };
export type { ComparisonIndexResponse };
