import type { StageJudgeOutput, StageScorecard } from "./contracts";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import { deriveStageGrade } from "./stage-grade";
import { parseStageRubric } from "./stage-rubric";

interface ScorecardFixture {
	readonly requirementStatus: "PASS" | "FAIL";
	readonly requirementId: string;
}

class StageScorecardBuilder {
	public constructor(private readonly props: Partial<ScorecardFixture> = {}) {}

	public build(): StageScorecard {
		const requirementStatus = this.props.requirementStatus ?? "PASS";
		const requirementId = this.props.requirementId ?? "scope";
		const rubric = StageScorecardBuilder.rubric(requirementId);

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
			input: new StageJudgeInputBuilder({ stage: "discuss" }).build(),
			prompt: "prompt",
			rubric,
			rubricPath: "rubrics/discuss.json",
			stage: "discuss",
		};
	}

	private static rubric(requirementId: string): StageScorecard["rubric"] {
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

export { StageScorecardBuilder as default };
