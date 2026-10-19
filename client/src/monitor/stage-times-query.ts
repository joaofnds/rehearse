import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const stageTimesRoute = apiClient.api.runs[":run"]["stage-times"];

type StageTimesResponse = InferResponseType<
	typeof stageTimesRoute.$get,
	typeof HTTP_STATUS.ok
>;

async function fetchStageTimes(run: string): Promise<StageTimesResponse> {
	const response = await stageTimesRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read the step times of runs before ${run}`);
	}

	return await response.json();
}

interface StageTimesQuery {
	readonly queryKey: readonly ["stage-times", string];
	readonly queryFn: () => Promise<StageTimesResponse>;
}

/**
 * How long each step of the run took in earlier runs of its case. Those runs
 * are recorded already, so no event of this run refetches it.
 */
function stageTimesQuery(run: string): StageTimesQuery {
	return {
		queryFn: async () => await fetchStageTimes(run),
		queryKey: ["stage-times", run],
	};
}

export { stageTimesQuery as default };
export type { StageTimesQuery, StageTimesResponse };
