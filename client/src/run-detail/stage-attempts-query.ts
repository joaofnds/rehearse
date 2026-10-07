import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageAttemptsRoute = apiClient.api.runs[":run"].stages[":stage"].attempts;

export type StageAttemptsResponse = InferResponseType<
	typeof stageAttemptsRoute.$get,
	200
>;

async function fetchStageAttempts(
	run: string,
	stage: string,
): Promise<StageAttemptsResponse> {
	const response = await stageAttemptsRoute.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Could not read the attempts at ${stage}'s checkpoint`);
	}

	return response.json();
}

/** The key every stage's attempts query starts with, to refresh a run's at once. */
export const STAGE_ATTEMPTS_KEY = "stage-attempts";

export interface StageAttemptsQuery {
	readonly queryKey: readonly [typeof STAGE_ATTEMPTS_KEY, string, string];
	readonly queryFn: () => Promise<StageAttemptsResponse>;
}

/** Every attempt at the checkpoint a run's stage started from. */
export function stageAttemptsQuery(
	run: string,
	stage: string,
): StageAttemptsQuery {
	return {
		queryKey: [STAGE_ATTEMPTS_KEY, run, stage],
		queryFn: () => fetchStageAttempts(run, stage),
	};
}
