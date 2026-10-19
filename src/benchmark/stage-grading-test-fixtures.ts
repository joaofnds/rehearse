import type { StageJudgeOutput, StageScorecard } from "./contracts";
import type { parseStageRubric } from "./stage-rubric";

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

function stageJudgeInput(
	stage: string,
	overrides: Partial<StageScorecard["input"]> = {},
): StageScorecard["input"] {
	return {
		baselineContext: [],
		instructions: "Instructions",
		kind: stage === "build" ? "delivery" : "planning",
		priorArtifacts: [],
		productBrief: "Brief",
		stage,
		task: "Task",
		taskState: "State",
		transcript: {
			costUsd: 1,
			exchanges: [],
			providerCalls: [],
			sessionId: "session",
			stage,
		},
		...overrides,
	};
}

function passingStageOutput(
	rubric: ReturnType<typeof parseStageRubric>,
): StageJudgeOutput {
	return {
		dimensions: rubric.dimensions.map(({ id }) => ({
			evidence: [stageEvidence("task", "backlog-seed.md")],
			grade: "A" as const,
			id,
		})),
		hardBlockers: rubric.hardBlockers.map(({ id }) => ({
			evidence: [stageEvidence("task", "backlog-seed.md")],
			id,
			status: "PASS" as const,
		})),
		requirements: rubric.requirements.map(({ id }) => ({
			evidence: [stageEvidence("task", "backlog-seed.md")],
			id,
			status: "PASS" as const,
		})),
		summary: "pass",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { claim: "evidence", path, source };
}

export { stageJudgeOutput, stageJudgeInput, passingStageOutput, stageEvidence };
