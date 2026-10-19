import type {
	ClaudeCallMetrics,
	StageJudgeInput,
	StageJudgeOutput,
	StageScorecard,
} from "./contracts";
import type { JudgeBudget } from "./judge-attempt";
import { deriveStageGrade } from "./stage-grade";
import { parseStageRubric } from "./stage-rubric";
import { AUDIT_LOG_RUBRICS_PATH } from "./test-support";

interface StageObservations {
	awaitingSubjects?: readonly string[] | undefined;
	stoppedScorecard?: StageScorecard | undefined;
}

interface StageJudgeExecution {
	readonly model: string;
	readonly effort: undefined | "low" | "medium" | "high" | "xhigh" | "max";
	readonly budget: JudgeBudget;
}

interface StageJudgment {
	readonly input: StageJudgeInput;
}

interface StageEventMetrics {
	readonly spentUsd: number;
	readonly elapsedMs: number;
}

function stageScorecard(
	requirementStatus: "PASS" | "FAIL",
	requirementId = "scope",
): StageScorecard {
	const rubric = planningRubric(requirementId);

	return {
		attempts: [],
		costUsd: 1,
		grade: deriveStageGrade(
			{
				...stageJudgeOutput("PASS", requirementStatus, "B"),
				requirements: [
					{
						evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
						id: requirementId,
						status: requirementStatus,
					},
				],
			},
			rubric,
		),
		input: {
			baselineContext: [],
			instructions: "Instructions",
			kind: "planning",
			priorArtifacts: [],
			productBrief: "Brief",
			stage: "discuss",
			task: "Task",
			taskState: "State",
			transcript: {
				costUsd: 1,
				exchanges: [],
				providerCalls: [],
				sessionId: "session",
				stage: "discuss",
			},
		},
		prompt: "prompt",
		rubric,
		rubricPath: "rubrics/discuss.json",
		stage: "discuss",
	};
}

function stageJudgeOutput(
	blocker: "PASS" | "FAIL",
	requirementStatus: "PASS" | "FAIL",
	dimensionGrade: "A" | "B" | "C" | "D" | "F",
): StageJudgeOutput {
	return {
		dimensions: [
			{
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
				grade: dimensionGrade,
				id: "clarity",
			},
		],
		hardBlockers: [
			{
				evidence: [stageEvidence("task", "backlog-seed.md")],
				id: "invalid-stage-delivery",
				status: "PASS",
			},
			{
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
				id: "contradiction",
				status: blocker,
			},
		],
		requirements: [
			{
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
				id: "scope",
				status: requirementStatus,
			},
		],
		summary: "stage grade",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { claim: "evidence", path, source };
}

const callMetricsForCost = (costUsd: number): ClaudeCallMetrics => ({
	cacheReadTokens: 3,
	cacheWriteTokens: 4,
	costUsd,
	inputTokens: 1,
	outputTokens: 2,
	turns: 1,
});

const read = (path: string): string =>
	JSON.stringify({
		message: {
			content: [
				{
					id: "t",
					input: { file_path: path },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	});

const deliveryStage = {
	kind: "delivery" as const,
	name: "build",
	rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
	skill: "build",
};

function planningRubric(
	requirementId: string,
): ReturnType<typeof parseStageRubric> {
	return parseStageRubric(
		JSON.stringify({
			dimensions: [
				{
					description: "Clear output",
					excellent: "Precise",
					good: "Concrete",
					id: "clarity",
				},
			],
			hardBlockers: [
				{
					description: "Valid delivery",
					id: "invalid-stage-delivery",
				},
				{ description: "No conflict", id: "contradiction" },
			],
			requirements: [{ description: "Scope is explicit", id: requirementId }],
			stage: "discuss",
		}),
	);
}

export {
	callMetricsForCost,
	deliveryStage,
	read,
	stageEvidence,
	stageJudgeOutput,
	stageScorecard,
};
export type {
	StageEventMetrics,
	StageJudgeExecution,
	StageJudgment,
	StageObservations,
};
