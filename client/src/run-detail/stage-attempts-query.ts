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

export interface StageAttemptsQuery {
	readonly queryKey: readonly ["stage-attempts", string, string];
	readonly queryFn: () => Promise<StageAttemptsResponse>;
}

/** Every attempt at the checkpoint a run's stage started from. */
export function stageAttemptsQuery(
	run: string,
	stage: string,
): StageAttemptsQuery {
	return {
		queryKey: ["stage-attempts", run, stage],
		queryFn: () => fetchStageAttempts(run, stage),
	};
}
