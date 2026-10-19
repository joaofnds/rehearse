import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const stageJudgeRoute = apiClient.api.runs[":run"].stages[":stage"].judge;

/**
 * How often a returning judge re-reads. The stage record that ends the
 * returning is written with no run event behind it, so without this read the
 * pane can sit on "grading" while a calibration review waits.
 */
const RETURNING_POLL_MS = 2000;

type StageJudgeResponse = InferResponseType<
	typeof stageJudgeRoute.$get,
	typeof HTTP_STATUS.ok
>;

async function fetchStageJudge(
	run: string,
	stage: string,
): Promise<StageJudgeResponse> {
	const response = await stageJudgeRoute.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Could not read the judge of ${stage}`);
	}

	return await response.json();
}

interface StageJudgeQuery {
	readonly queryKey: readonly ["stage-judge", string, string];
	readonly queryFn: () => Promise<StageJudgeResponse>;
	readonly refetchInterval: (query: {
		readonly state: { readonly data?: StageJudgeResponse | undefined };
	}) => number | false;
}

/** The key every stage judge of the run shares, to refetch them together. */
function stageJudgesQueryKey(run: string): readonly ["stage-judge", string] {
	return ["stage-judge", run];
}

/**
 * One stage's judge. Each reading of its progress is a run event, so a run
 * event refetches it, and it is re-read while it returns. Once judged only a
 * run event refetches it.
 */
function stageJudgeQuery(run: string, stage: string): StageJudgeQuery {
	return {
		queryFn: async () => await fetchStageJudge(run, stage),
		queryKey: [...stageJudgesQueryKey(run), stage],
		refetchInterval: ({ state }) =>
			state.data?.state === "returning" ? RETURNING_POLL_MS : false,
	};
}

export { stageJudgeQuery, stageJudgesQueryKey };
export type { StageJudgeQuery, StageJudgeResponse };
