import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const stageOutput = apiClient.api.runs[":run"].stages[":stage"].output;

const finalAssessment = apiClient.api.runs[":run"].final.assessment;

const STAGE_OUTPUT_KEY = "stage-output";

const FINAL_ASSESSMENT_KEY = "final-assessment";

type StageOutputResponse = InferResponseType<
	typeof stageOutput.$get,
	typeof HTTP_STATUS.ok
>;

type FinalAssessmentResponse = InferResponseType<
	typeof finalAssessment.$get,
	typeof HTTP_STATUS.ok
>;

interface StageOutputQuery {
	readonly queryKey: readonly ["stage-output", string, string];
	readonly queryFn: () => Promise<StageOutputResponse>;
}

function stageOutputQuery(run: string, stage: string): StageOutputQuery {
	return {
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
			return await response.json();
		},
		queryKey: [STAGE_OUTPUT_KEY, run, stage],
	} as const;
}

interface FinalAssessmentQuery {
	readonly queryKey: readonly ["final-assessment", string];
	readonly queryFn: () => Promise<FinalAssessmentResponse>;
}

function finalAssessmentQuery(run: string): FinalAssessmentQuery {
	return {
		queryFn: async (): Promise<FinalAssessmentResponse> => {
			const response = await finalAssessment.$get({
				param: { run: encodeURIComponent(run) },
			});
			if (!response.ok) {
				throw new Error("Could not read saved final criteria");
			}
			return await response.json();
		},
		queryKey: [FINAL_ASSESSMENT_KEY, run],
	} as const;
}

export {
	FINAL_ASSESSMENT_KEY,
	finalAssessmentQuery,
	STAGE_OUTPUT_KEY,
	stageOutputQuery,
};
export type { FinalAssessmentResponse, StageOutputResponse };
