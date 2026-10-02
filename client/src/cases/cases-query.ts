import type { InferResponseType } from "hono/client";
import { launchClient } from "#client/api-client";

export type CasesResponse = InferResponseType<
	typeof launchClient.api.cases.$get
>;

async function fetchCases(): Promise<CasesResponse> {
	const response = await launchClient.api.cases.$get();
	if (!response.ok) {
		throw new Error("Could not load the cases");
	}

	return response.json();
}

export const casesQuery = {
	queryKey: ["cases"],
	queryFn: fetchCases,
} as const;
