import type { InferResponseType } from "hono/client";

import type { Immutable } from "#benchmark/contracts";
import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const analysesRoute = apiClient.api.runs[":run"].analyses;

type AnalysisReadingResponse = Immutable<
	InferResponseType<typeof analysesRoute.$get, typeof HTTP_STATUS.ok>
>;

type AnalysisRecord = NonNullable<AnalysisReadingResponse["newest"]>;

type RecordedAnalysis = Extract<
	AnalysisRecord,
	{ readonly outcome: "recorded" }
>;

type AnalyzedStage = RecordedAnalysis["stages"][number];

type AnalysisRole = AnalyzedStage["role"];

async function fetchAnalyses(run: string): Promise<AnalysisReadingResponse> {
	const response = await analysesRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read the root-cause analyses of run ${run}`);
	}

	return await response.json();
}

interface AnalysesQuery {
	readonly queryKey: readonly ["root-cause-analyses", string];
	readonly queryFn: () => Promise<AnalysisReadingResponse>;
}

/** The root-cause analyses recorded of one pipeline run, newest first. */
function analysesQuery(run: string): AnalysesQuery {
	return {
		queryFn: async () => await fetchAnalyses(run),
		queryKey: ["root-cause-analyses", run],
	};
}

/** The role each step played in the newest analysis, when it was recorded. */
function rolesOf(
	reading: AnalysisReadingResponse | undefined,
): ReadonlyMap<string, AnalyzedStage> {
	const newest = reading?.newest;

	return new Map(
		newest?.outcome === "recorded"
			? newest.stages.map((stage) => [stage.stage, stage])
			: [],
	);
}

export { analysesQuery, rolesOf };
export type {
	AnalysesQuery,
	AnalysisReadingResponse,
	AnalysisRecord,
	AnalysisRole,
	AnalyzedStage,
	RecordedAnalysis,
};
