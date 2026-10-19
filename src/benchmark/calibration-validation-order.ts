import type { JsonFieldOrder } from "./ordered-json";
import type { ValidationFieldOrder } from "./validation-issue-order";

// Recorded contracts share their historical field order across persisted bytes
// and public validation diagnostics, independently of source declaration order.
const evidenceLocatorValidationOrder: ValidationFieldOrder = {
	fields: [
		"kind",
		"file",
		"startLine",
		"endLine",
		"hunk",
		"occurrences",
		"index",
		"exchange",
		"field",
		"start",
		"end",
		"result",
		"recorded",
	],
};

const evidenceValidationOrder: ValidationFieldOrder = {
	fields: ["source", "path", "claim"],
};

const recordedStageEvidenceValidationOrder: ValidationFieldOrder = {
	children: {
		locator: evidenceLocatorValidationOrder,
	},
	fields: ["source", "path", "claim", "quote", "locator"],
};

const claudeCallMetricsValidationOrder: ValidationFieldOrder = {
	children: {
		modelUsage: {
			fields: [],
			values: {
				fields: [
					"inputTokens",
					"outputTokens",
					"cacheReadInputTokens",
					"cacheCreationInputTokens",
					"costUSD",
					"contextWindow",
					"maxOutputTokens",
				],
			},
		},
	},
	fields: [
		"costUsd",
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
		"turns",
		"durationMs",
		"apiDurationMs",
		"modelUsage",
	],
};

const contextFileValidationOrder: ValidationFieldOrder = {
	fields: ["path", "content"],
};

const localCheckResultValidationOrder: ValidationFieldOrder = {
	children: {
		evidence: evidenceValidationOrder,
	},
	fields: ["status", "evidence"],
};

const stageRubricFieldOrder: JsonFieldOrder = {
	children: {
		dimensions: {
			fields: ["id", "description", "good", "excellent"],
		},
		hardBlockers: {
			fields: ["id", "description"],
		},
		requirements: {
			fields: ["id", "description"],
		},
	},
	fields: ["hardBlockers", "requirements", "dimensions"],
};

const judgeGradeValidationOrder: ValidationFieldOrder = {
	children: {
		requirements: {
			children: {
				evidence: recordedStageEvidenceValidationOrder,
			},
			fields: ["id", "status", "evidence"],
		},
	},
	fields: ["requirements", "verdict", "summary"],
};

const stageJudgeInputValidationOrder: ValidationFieldOrder = {
	children: {
		artifact: contextFileValidationOrder,
		baselineContext: contextFileValidationOrder,
		checkIntegrity: localCheckResultValidationOrder,
		localChecks: localCheckResultValidationOrder,
		priorArtifacts: contextFileValidationOrder,
		transcript: {
			children: {
				exchanges: {
					children: {
						agent: {
							fields: ["status", "message"],
						},
					},
					fields: ["agent", "productOwnerAnswer"],
				},
				providerCalls: {
					children: {
						metrics: claudeCallMetricsValidationOrder,
					},
					fields: ["metrics"],
				},
			},
			fields: ["stage", "sessionId", "costUsd", "providerCalls", "exchanges"],
		},
	},
	fields: [
		"stage",
		"kind",
		"task",
		"productBrief",
		"instructions",
		"baselineContext",
		"taskState",
		"transcript",
		"artifact",
		"priorArtifacts",
		"diff",
		"changedPaths",
		"commitSubjects",
		"checkIntegrity",
		"localChecks",
		"harnessFailure",
	],
};

const judgeAttemptValidationOrder: ValidationFieldOrder = {
	children: {
		metrics: claudeCallMetricsValidationOrder,
	},
	fields: ["payload", "costUsd", "metrics", "outcome", "error"],
};

const stageGradeFieldOrder: JsonFieldOrder = {
	children: {
		dimensions: {
			children: {
				evidence: recordedStageEvidenceValidationOrder,
			},
			fields: ["id", "grade", "evidence"],
		},
		hardBlockers: {
			children: {
				evidence: recordedStageEvidenceValidationOrder,
			},
			fields: ["id", "status", "evidence"],
		},
		requirements: {
			children: {
				evidence: recordedStageEvidenceValidationOrder,
			},
			fields: ["id", "status", "evidence"],
		},
	},
	fields: [
		"hardBlockers",
		"requirements",
		"dimensions",
		"summary",
		"grade",
		"verdict",
	],
};

const stageScorecardValidationOrder: ValidationFieldOrder = {
	children: {
		attempts: judgeAttemptValidationOrder,
		grade: stageGradeFieldOrder,
		input: stageJudgeInputValidationOrder,
		rubric: stageRubricFieldOrder,
	},
	fields: [
		"stage",
		"rubricPath",
		"rubric",
		"input",
		"prompt",
		"attempts",
		"costUsd",
		"grade",
	],
};

const humanReviewValidationOrder: ValidationFieldOrder = {
	children: {
		findings: {
			fields: ["description", "paths", "stage", "judgeAssessment", "rubricId"],
		},
	},
	fields: ["verdict", "summary", "findings"],
};

const calibratableArtifactValidationOrder: ValidationFieldOrder = {
	children: {
		baselineContext: contextFileValidationOrder,
		checkIntegrity: localCheckResultValidationOrder,
		grade: judgeGradeValidationOrder,
		localChecks: localCheckResultValidationOrder,
		stageScorecards: stageScorecardValidationOrder,
	},
	fields: [
		"judgeModel",
		"judgeEffort",
		"sessionBudgetUsd",
		"status",
		"caseId",
		"sourceRoot",
		"resultSha",
		"instructions",
		"rubric",
		"grade",
		"baselineContext",
		"diff",
		"changedPaths",
		"checkIntegrity",
		"localChecks",
		"stageScorecards",
		"reviewFile",
	],
};

export {
	calibratableArtifactValidationOrder,
	humanReviewValidationOrder,
	judgeGradeValidationOrder,
	stageGradeFieldOrder,
	stageRubricFieldOrder,
	stageScorecardValidationOrder,
};
