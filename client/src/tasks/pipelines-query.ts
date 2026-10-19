import type { InferResponseType } from "hono/client";

import { launchClient } from "#client/api-client";

type PipelinesResponse = InferResponseType<
	typeof launchClient.api.pipelines.$get
>;

async function fetchPipelines(): Promise<PipelinesResponse> {
	const response = await launchClient.api.pipelines.$get();
	if (!response.ok) {
		throw new Error("Could not load the tasks");
	}

	return await response.json();
}

const pipelinesQuery = {
	queryFn: fetchPipelines,
	queryKey: ["pipelines"],
} as const;

export { pipelinesQuery as default };
export type { PipelinesResponse };
