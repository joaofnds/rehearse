import type { PipelineConfirmationRequest } from "./pipeline-confirmation";
import { CONFIRMATION_STAGE_RUBRIC } from "./pipeline-confirmation-judging-test-fixtures";
import { CONFIRMATION_PIPELINE } from "./pipeline-confirmation-test-data";

const GIT_SHA1_HEX_DIGITS = 40;

class PipelineConfirmationRequestBuilder {
	public constructor(
		private readonly overrides: Partial<PipelineConfirmationRequest> = {},
	) {}
	public build(): PipelineConfirmationRequest {
		return {
			approvalMethod: "yes",
			caseId: "audit-log",
			controlSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
			corpusRoots: [
				{ kind: "directory", root: "/tmp/rehearse-pipeline-corpus" },
			],
			effort: "high",
			finalRubric: "1. `final`: pass the candidate\n",
			groupId: "pipeline-confirmation-1",
			instructions: "Frozen instructions\n",
			judgeEffort: "high",
			judgeModel: "opus",
			model: "sonnet",
			pipeline: CONFIRMATION_PIPELINE,
			pipelinePath: "pipelines/test.json",
			productBrief: "Product brief",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 3,
				totalMaximumUsd: 135,
			},
			reps: 3,
			runsDirectory: "/tmp/rehearse-pipeline-runs",
			sessionBudgetUsd: 5,
			source: {
				root: "/tmp/rehearse-pipeline-source",
				sha: "a".repeat(GIT_SHA1_HEX_DIGITS),
			},
			spendCeilingUsd: 100,
			stageRubrics: {
				build: {
					content: "{}\n",
					rubric: CONFIRMATION_STAGE_RUBRIC,
					rubricPath: "rubrics/build.json",
				},
				discuss: {
					content: "{}\n",
					rubric: CONFIRMATION_STAGE_RUBRIC,
					rubricPath: "rubrics/discuss.json",
				},
			},
			task: "# Task\n\nImplement it.",
			...this.overrides,
		};
	}
}
export { PipelineConfirmationRequestBuilder as default };
