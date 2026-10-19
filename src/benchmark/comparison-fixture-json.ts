import type { JsonFieldOrder } from "./ordered-json";
import orderedJson from "./ordered-json";

const armsOrder: JsonFieldOrder = {
	fields: ["baseline", "candidate", "control"],
};

const casesOrder: JsonFieldOrder = {
	children: {
		arms: armsOrder,
	},
	fields: ["caseId", "arms"],
};

const manifestOrder: JsonFieldOrder = {
	children: {
		cases: casesOrder,
	},
	fields: ["schemaVersion", "cases"],
};

const lineageOrder: JsonFieldOrder = {
	fields: ["kind", "lineage", "targetSha"],
};

const filesOrder: JsonFieldOrder = {
	fields: ["kind", "path", "sha256"],
};

const inputsOrder: JsonFieldOrder = {
	children: {
		files: filesOrder,
		lineage: lineageOrder,
	},
	fields: [
		"lineage",
		"files",
		"model",
		"judgeModel",
		"sessionBudgetUsd",
		"pipelinePath",
	],
};

const projectedCostOrder: JsonFieldOrder = {
	fields: ["reps", "perRepMaximumUsd", "totalMaximumUsd"],
};

const approvalOrder: JsonFieldOrder = {
	fields: ["method", "approved"],
};

const repRecordsOrder: JsonFieldOrder = {
	fields: ["repId", "ordinal", "path"],
};

const groupOrder: JsonFieldOrder = {
	children: {
		approval: approvalOrder,
		inputs: inputsOrder,
		projectedCost: projectedCostOrder,
		repRecords: repRecordsOrder,
	},
	fields: [
		"schemaVersion",
		"caseId",
		"groupId",
		"mode",
		"reps",
		"declaredStages",
		"inputs",
		"projectedCost",
		"approval",
		"repRecords",
		"reportFile",
		"makespanMs",
	],
};

const evidenceOrder: JsonFieldOrder = {
	fields: ["resultSha", "recordFile"],
};

const stagesOrder: JsonFieldOrder = {
	children: {
		evidence: evidenceOrder,
	},
	fields: ["stage", "status", "grade", "verdict", "elapsedMs", "evidence"],
};

const finalOutcomeOrder: JsonFieldOrder = {
	fields: ["status"],
};

const callMetricsOrder: JsonFieldOrder = {
	fields: [
		"costUsd",
		"inputTokens",
		"outputTokens",
		"cacheReadTokens",
		"cacheWriteTokens",
		"turns",
	],
};

const callsOrder: JsonFieldOrder = {
	children: {
		metrics: callMetricsOrder,
	},
	fields: ["role", "metrics"],
};

const metricsOrder: JsonFieldOrder = {
	children: {
		calls: callsOrder,
	},
	fields: ["status", "calls"],
};

const repOrder: JsonFieldOrder = {
	children: {
		finalOutcome: finalOutcomeOrder,
		lineage: lineageOrder,
		metrics: metricsOrder,
		stages: stagesOrder,
	},
	fields: [
		"schemaVersion",
		"caseId",
		"groupId",
		"repId",
		"ordinal",
		"mode",
		"worktreePath",
		"lineage",
		"outcome",
		"stages",
		"finalOutcome",
		"metrics",
		"workerTrajectorySteps",
		"elapsedMs",
	],
};

const artifactOrder: JsonFieldOrder = {
	fields: ["path", "content"],
};

const inputOrder: JsonFieldOrder = {
	children: {
		artifact: artifactOrder,
	},
	fields: ["artifact"],
};

const hardBlockersOrder: JsonFieldOrder = {
	fields: ["id", "status"],
};

const dimensionsOrder: JsonFieldOrder = {
	fields: ["id", "grade"],
};

const gradeOrder: JsonFieldOrder = {
	children: {
		dimensions: dimensionsOrder,
		hardBlockers: hardBlockersOrder,
	},
	fields: ["hardBlockers", "dimensions", "grade", "verdict"],
};

const scorecardOrder: JsonFieldOrder = {
	children: {
		grade: gradeOrder,
		input: inputOrder,
	},
	fields: ["stage", "input", "grade"],
};

const formats = {
	group: groupOrder,
	manifest: manifestOrder,
	rep: repOrder,
	scorecard: scorecardOrder,
};

interface FixtureSerialization {
	readonly kind: keyof typeof formats;
	readonly json: string;
}

function comparisonFixtureJson({ json, kind }: FixtureSerialization): string {
	return orderedJson({ json, order: formats[kind] });
}

export { comparisonFixtureJson as default };
