import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageTimesRoute = apiClient.api.runs[":run"]["stage-times"];

export type StageTimesResponse = InferResponseType<
	typeof stageTimesRoute.$get,
	200
>;

async function fetchStageTimes(run: string): Promise<StageTimesResponse> {
	const response = await stageTimesRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read the step times of runs before ${run}`);
	}

	return response.json();
}

export interface StageTimesQuery {
	readonly queryKey: readonly ["stage-times", string];
	readonly queryFn: () => Promise<StageTimesResponse>;
}

/**
 * How long each step of the run took in earlier runs of its case. Those runs
 * are recorded already, so no event of this run refetches it.
 */
export function stageTimesQuery(run: string): StageTimesQuery {
	return {
		queryKey: ["stage-times", run],
		queryFn: () => fetchStageTimes(run),
	};
}
