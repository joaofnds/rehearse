import type { InferResponseType } from "hono/client";
import { launchClient } from "#client/api-client";

export type PipelinesResponse = InferResponseType<
	typeof launchClient.api.pipelines.$get
>;

async function fetchPipelines(): Promise<PipelinesResponse> {
	const response = await launchClient.api.pipelines.$get();
	if (!response.ok) {
		throw new Error("Could not load the tasks");
	}

	return response.json();
}

export const pipelinesQuery = {
	queryKey: ["pipelines"],
	queryFn: fetchPipelines,
} as const;
