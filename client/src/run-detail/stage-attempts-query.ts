import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const stageAttemptsRoute = apiClient.api.runs[":run"].stages[":stage"].attempts;

type StageAttemptsResponse = InferResponseType<
	typeof stageAttemptsRoute.$get,
	typeof HTTP_STATUS.ok
>;

async function fetchStageAttempts(
	run: string,
	stage: string,
): Promise<StageAttemptsResponse> {
	const response = await stageAttemptsRoute.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Could not read the attempts at ${stage}'s checkpoint`);
	}

	return await response.json();
}

/** The key every stage's attempts query starts with, to refresh a run's at once. */
const STAGE_ATTEMPTS_KEY = "stage-attempts";

interface StageAttemptsQuery {
	readonly queryKey: readonly [typeof STAGE_ATTEMPTS_KEY, string, string];
	readonly queryFn: () => Promise<StageAttemptsResponse>;
}

/** Every attempt at the checkpoint a run's stage started from. */
function stageAttemptsQuery(run: string, stage: string): StageAttemptsQuery {
	return {
		queryFn: async () => await fetchStageAttempts(run, stage),
		queryKey: [STAGE_ATTEMPTS_KEY, run, stage],
	};
}

export { STAGE_ATTEMPTS_KEY, stageAttemptsQuery };
export type { StageAttemptsQuery, StageAttemptsResponse };
