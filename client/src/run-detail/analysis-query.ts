import type { InferResponseType } from "hono/client";
import type { Immutable } from "#benchmark/contracts";
import { apiClient } from "#client/api-client";

const analysesRoute = apiClient.api.runs[":run"].analyses;

export type AnalysisReadingResponse = Immutable<
	InferResponseType<typeof analysesRoute.$get, 200>
>;

export type AnalysisRecord = NonNullable<AnalysisReadingResponse["newest"]>;

export type RecordedAnalysis = Extract<
	AnalysisRecord,
	{ readonly outcome: "recorded" }
>;

export type AnalyzedStage = RecordedAnalysis["stages"][number];

export type AnalysisRole = AnalyzedStage["role"];

async function fetchAnalyses(run: string): Promise<AnalysisReadingResponse> {
	const response = await analysesRoute.$get({ param: { run } });
	if (!response.ok) {
		throw new Error(`Could not read the root-cause analyses of run ${run}`);
	}

	return response.json();
}

export interface AnalysesQuery {
	readonly queryKey: readonly ["root-cause-analyses", string];
	readonly queryFn: () => Promise<AnalysisReadingResponse>;
}

/** The root-cause analyses recorded of one pipeline run, newest first. */
export function analysesQuery(run: string): AnalysesQuery {
	return {
		queryKey: ["root-cause-analyses", run],
		queryFn: () => fetchAnalyses(run),
	};
}

/** The role each step played in the newest analysis, when it was recorded. */
export function rolesOf(
	reading: AnalysisReadingResponse | undefined,
): ReadonlyMap<string, AnalyzedStage> {
	const newest = reading?.newest;

	return new Map(
		newest?.outcome === "recorded"
			? newest.stages.map((stage) => [stage.stage, stage])
			: [],
	);
}
