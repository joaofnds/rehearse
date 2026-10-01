import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageJudgeRoute = apiClient.api.runs[":run"].stages[":stage"].judge;

export type StageJudgeResponse = InferResponseType<
	typeof stageJudgeRoute.$get,
	200
>;

async function fetchStageJudge(
	run: string,
	stage: string,
): Promise<StageJudgeResponse> {
	const response = await stageJudgeRoute.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Could not read the judge of ${stage}`);
	}

	return response.json();
}

export interface StageJudgeQuery {
	readonly queryKey: readonly ["stage-judge", string, string];
	readonly queryFn: () => Promise<StageJudgeResponse>;
}

/** The key every stage judge of the run shares, to refetch them together. */
export function stageJudgesQueryKey(
	run: string,
): readonly ["stage-judge", string] {
	return ["stage-judge", run];
}

/**
 * One stage's judge. Each reading of its progress is a run event, so a run
 * event refetches it and nothing polls.
 */
export function stageJudgeQuery(run: string, stage: string): StageJudgeQuery {
	return {
		queryKey: [...stageJudgesQueryKey(run), stage],
		queryFn: () => fetchStageJudge(run, stage),
	};
}
