import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageSessionRoute = apiClient.api.runs[":run"].stages[":stage"].session;

export type StageSessionResponse = InferResponseType<
	typeof stageSessionRoute.$get,
	200
>;

/**
 * How often a running stage's pane re-reads its session. A transcript append
 * records no run event, so only this read moves the tail.
 */
const RUNNING_POLL_MS = 2000;

async function fetchStageSession(
	run: string,
	stage: string,
): Promise<StageSessionResponse> {
	const response = await stageSessionRoute.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Could not read the session of ${stage}`);
	}

	return response.json();
}

export interface StageSessionQuery {
	readonly queryKey: readonly ["stage-session", string, string];
	readonly queryFn: () => Promise<StageSessionResponse>;
	readonly refetchInterval: (query: {
		readonly state: { readonly data?: StageSessionResponse | undefined };
	}) => number | false;
}

/** The key every stage session of the run shares, to refetch them together. */
export function stageSessionsQueryKey(
	run: string,
): readonly ["stage-session", string] {
	return ["stage-session", run];
}

/**
 * One stage's session, re-read while it runs. Once it stops running only a run
 * event refetches it.
 */
export function stageSessionQuery(
	run: string,
	stage: string,
): StageSessionQuery {
	return {
		queryKey: [...stageSessionsQueryKey(run), stage],
		queryFn: () => fetchStageSession(run, stage),
		refetchInterval: ({ state }) =>
			state.data?.state === "running" ? RUNNING_POLL_MS : false,
	};
}
