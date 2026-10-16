import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageOutput = apiClient.api.runs[":run"].stages[":stage"].output;
const finalAssessment = apiClient.api.runs[":run"].final.assessment;
export const STAGE_OUTPUT_KEY = "stage-output";
export const FINAL_ASSESSMENT_KEY = "final-assessment";
export type StageOutputResponse = InferResponseType<
	typeof stageOutput.$get,
	200
>;
export type FinalAssessmentResponse = InferResponseType<
	typeof finalAssessment.$get,
	200
>;

interface StageOutputQuery {
	readonly queryKey: readonly ["stage-output", string, string];
	readonly queryFn: () => Promise<StageOutputResponse>;
}

export function stageOutputQuery(run: string, stage: string): StageOutputQuery {
	return {
		queryKey: [STAGE_OUTPUT_KEY, run, stage],
		queryFn: async (): Promise<StageOutputResponse> => {
			const response = await stageOutput.$get({
				param: {
					run: encodeURIComponent(run),
					stage: encodeURIComponent(stage),
				},
			});
			if (!response.ok) {
				throw new Error("Could not read saved step output");
			}
			return response.json();
		},
	} as const;
}

interface FinalAssessmentQuery {
	readonly queryKey: readonly ["final-assessment", string];
	readonly queryFn: () => Promise<FinalAssessmentResponse>;
}

export function finalAssessmentQuery(run: string): FinalAssessmentQuery {
	return {
		queryKey: [FINAL_ASSESSMENT_KEY, run],
		queryFn: async (): Promise<FinalAssessmentResponse> => {
			const response = await finalAssessment.$get({
				param: { run: encodeURIComponent(run) },
			});
			if (!response.ok) {
				throw new Error("Could not read saved final criteria");
			}
			return response.json();
		},
	} as const;
}
