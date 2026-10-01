import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageJudgeRoute = apiClient.api.runs[":run"].stages[":stage"].judge;

/**
 * How often a returning judge re-reads. The stage record that ends the
 * returning is written with no run event behind it, so without this read the
 * pane can sit on "grading" while a calibration review waits.
 */
const RETURNING_POLL_MS = 2000;

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
	readonly refetchInterval: (query: {
		readonly state: { readonly data?: StageJudgeResponse | undefined };
	}) => number | false;
}

/** The key every stage judge of the run shares, to refetch them together. */
export function stageJudgesQueryKey(
	run: string,
): readonly ["stage-judge", string] {
	return ["stage-judge", run];
}

/**
 * One stage's judge. Each reading of its progress is a run event, so a run
 * event refetches it, and it is re-read while it returns. Once judged only a
 * run event refetches it.
 */
export function stageJudgeQuery(run: string, stage: string): StageJudgeQuery {
	return {
		queryKey: [...stageJudgesQueryKey(run), stage],
		queryFn: () => fetchStageJudge(run, stage),
		refetchInterval: ({ state }) =>
			state.data?.state === "returning" ? RETURNING_POLL_MS : false,
	};
}
