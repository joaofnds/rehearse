import type {
	HumanReview,
	JudgeGrade,
	StageJudgeOutput,
	StageScorecard,
} from "./contracts";
import { deriveStageGrade } from "./stage-grade";
import { parseStageRubric } from "./stage-rubric";

const OMITTED_INITIAL_REQUIREMENT_COUNT = 1;

const FIRST_RUBRIC_ID_INDEX = 0;

interface HumanReviewFinding {
	readonly verdict: HumanReview["verdict"];
	readonly judgeAssessment: HumanReview["findings"][number]["judgeAssessment"];
	readonly rubricId: string;
}

function humanReview(
	{ verdict, judgeAssessment, rubricId }: HumanReviewFinding,
	stage = "final",
): HumanReview {
	return {
		findings: [
			{
				description: "Finding",
				judgeAssessment,
				paths: ["src/audit/example.ts"],
				rubricId,
				stage,
			},
		],
		summary: "Human review",
		verdict,
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

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		evidence: [
			{
				claim: `${id} evidence`,
				path: "src/audit/example.ts",
				source: "diff",
			},
		],
		id,
		status,
	};
}

function stageScorecard(
	requirementStatus: "PASS" | "FAIL",
	requirementId = "scope",
): StageScorecard {
	const rubric = calibrationStageRubric(requirementId);

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
		input: calibrationStageInput(),
		prompt: "prompt",
		rubric,
		rubricPath: "rubrics/discuss.json",
		stage: "discuss",
	};
}

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		summary: "complete",
		verdict,
	};
}

function withFailedFirstRequirement(id: string): JudgeGrade {
	return {
		...withFirstRequirement(completeGrade("PASS"), requirement(id, "FAIL")),
		verdict: "FAIL",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { claim: "evidence", path, source };
}

function withFirstRequirement(
	grade: JudgeGrade,
	first: JudgeGrade["requirements"][number],
): JudgeGrade {
	return {
		...grade,
		requirements: [
			first,
			...grade.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};
}

function calibrationStageRubric(
	requirementId: string,
): StageScorecard["rubric"] {
	const rubric = parseStageRubric(
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
	return rubric;
}

function calibrationStageInput(): StageScorecard["input"] {
	return {
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
	};
}

export {
	FIRST_RUBRIC_ID_INDEX,
	humanReview,
	stageJudgeOutput,
	requirement,
	stageScorecard,
	RUBRIC_IDS,
	completeGrade,
	withFailedFirstRequirement,
	calibrationStageInput,
};
