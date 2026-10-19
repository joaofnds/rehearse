import type { Immutable, StageScorecard } from "#benchmark/contracts";
import { parseStageRubric } from "#benchmark/stage-rubric";

const STAGE_RUBRIC = {
	dimensions: [
		{
			description: "Clear output",
			excellent: "Precise",
			good: "Concrete",
			id: "clarity",
		},
	],
	hardBlockers: [
		{ description: "Valid delivery", id: "invalid-stage-delivery" },
		{ description: "No conflict", id: "contradiction" },
	],
	requirements: [{ description: "Scope is explicit", id: "scope" }],
	stage: "discuss",
};

function stageRubricText(scopeDescription: string): string {
	return JSON.stringify({
		...STAGE_RUBRIC,
		requirements: [{ description: scopeDescription, id: "scope" }],
	});
}

function stageEvidence(): readonly {
	source: "artifact";
	path: string;
	claim: string;
}[] {
	return [
		{ claim: "evidence", path: "backlog/docs/spec.md", source: "artifact" },
	];
}

const DEFAULT_STAGE_GRADE: StageScorecard["grade"] = {
	dimensions: [{ evidence: stageEvidence(), grade: "B", id: "clarity" }],
	grade: "B",
	hardBlockers: [
		{ evidence: stageEvidence(), id: "invalid-stage-delivery", status: "PASS" },
		{ evidence: stageEvidence(), id: "contradiction", status: "PASS" },
	],
	requirements: [{ evidence: stageEvidence(), id: "scope", status: "PASS" }],
	summary: "stage grade",
	verdict: "CONTINUE",
};

const DEFAULT_STAGE_INPUT: StageScorecard["input"] = {
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

interface ScopeResult {
	readonly status: StageScorecard["grade"]["requirements"][number]["status"];
	readonly verdict?: StageScorecard["grade"]["verdict"];
}

class StageScorecardBuilder {
	public constructor(
		private readonly props: Immutable<Partial<StageScorecard>> = {},
	) {}

	public withScopeResult({
		status,
		verdict = status === "PASS" ? "CONTINUE" : "STOP",
	}: ScopeResult): StageScorecardBuilder {
		const grade = this.props.grade ?? DEFAULT_STAGE_GRADE;

		return new StageScorecardBuilder({
			...this.props,
			grade: {
				...grade,
				grade: verdict === "CONTINUE" ? "B" : "F",
				requirements: [{ evidence: stageEvidence(), id: "scope", status }],
				verdict,
			},
		});
	}

	public build(): StageScorecard {
		return {
			attempts: [],
			costUsd: 1,
			grade: DEFAULT_STAGE_GRADE,
			input: DEFAULT_STAGE_INPUT,
			prompt: "prompt",
			rubric: parseStageRubric(stageRubricText("Scope is explicit")),
			rubricPath: "discuss.json",
			stage: "discuss",
			...this.props,
		};
	}
}

export { StageScorecardBuilder as default, stageRubricText };
