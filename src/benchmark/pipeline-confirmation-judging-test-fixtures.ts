import type {
	ClaudeCallMetrics,
	JudgeGrade,
	StageJudgeInput,
	StageRubric,
	StageScorecard,
} from "./contracts";
import type { JudgeResult } from "./judge";

const CONFIRMATION_METRIC: ClaudeCallMetrics = {
	cacheReadTokens: 30,
	cacheWriteTokens: 40,
	costUsd: 0.25,
	inputTokens: 100,
	outputTokens: 20,
	turns: 2,
};

const CONFIRMATION_STAGE_RUBRIC: StageRubric = {
	dimensions: [
		{ description: "Clear", excellent: "e", good: "g", id: "clarity" },
	],
	hardBlockers: [],
	requirements: [{ description: "Scope is explicit", id: "scope" }],
};

interface PipelineJudgeRubric {
	readonly rubricPath: string;
	readonly rubric: StageRubric;
}

function pipelineStageScorecard(
	input: StageJudgeInput,
	source: PipelineJudgeRubric,
): StageScorecard {
	return {
		attempts: [
			{
				costUsd: CONFIRMATION_METRIC.costUsd,
				metrics: CONFIRMATION_METRIC,
				outcome: "ACCEPTED",
				payload: { summary: "accepted" },
			},
		],
		costUsd: CONFIRMATION_METRIC.costUsd,
		grade: {
			dimensions: [],
			grade: "A",
			hardBlockers: [],
			requirements: [],
			summary: "graded",
			verdict: "CONTINUE",
		},
		input,
		prompt: "prompt",
		rubric: source.rubric,
		rubricPath: source.rubricPath,
		stage: input.stage,
	};
}

function completeFinalGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: ["tests", "worker", "check-integrity", "local-checks"].map(
			(id) => ({
				evidence: [
					{
						claim: `${id} evidence`,
						path: "src/audit/example.ts",
						source: "diff" as const,
					},
				],
				id,
				status: verdict,
			}),
		),
		summary: "complete",
		verdict,
	};
}

function completeFinalJudgment(): JudgeResult {
	return {
		attempts: [
			{
				costUsd: CONFIRMATION_METRIC.costUsd,
				metrics: CONFIRMATION_METRIC,
				outcome: "ACCEPTED",
				payload: { summary: "pass" },
			},
		],
		costUsd: CONFIRMATION_METRIC.costUsd,
		grade: completeFinalGrade("PASS"),
		prompt: "final prompt",
	};
}

export {
	CONFIRMATION_METRIC,
	CONFIRMATION_STAGE_RUBRIC,
	completeFinalGrade,
	completeFinalJudgment,
	pipelineStageScorecard,
};
