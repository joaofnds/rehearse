import type { InferResponseType } from "hono/client";

import { launchClient } from "#client/api-client";

type CasesResponse = InferResponseType<typeof launchClient.api.cases.$get>;

async function fetchCases(): Promise<CasesResponse> {
	const response = await launchClient.api.cases.$get();
	if (!response.ok) {
		throw new Error("Could not load the cases");
	}

	return await response.json();
}

const casesQuery = {
	queryFn: fetchCases,
	queryKey: ["cases"],
} as const;

export { casesQuery as default };
export type { CasesResponse };
