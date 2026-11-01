import type { JsonFieldOrder } from "./ordered-json";

const digestedPathOrder: JsonFieldOrder = {
	fields: ["path", "sha256"],
};

const outcomesOrder: JsonFieldOrder = {
	fields: ["name", "status", "grade", "successful"],
};

const failedChecksOrder: JsonFieldOrder = {
	fields: ["index", "kind", "detail"],
};

const checksOrder: JsonFieldOrder = {
	children: {
		failing: failedChecksOrder,
	},
	fields: ["passed", "declared", "failing"],
};

const failingStateOutcomesOrder: JsonFieldOrder = {
	fields: ["name", "detail"],
};

const stateResultsOrder: JsonFieldOrder = {
	children: {
		failing: failingStateOutcomesOrder,
	},
	fields: ["passed", "declared", "failing"],
};

const hardBlockersOrder: JsonFieldOrder = {
	fields: ["id", "fired"],
};

const dimensionsOrder: JsonFieldOrder = {
	fields: ["id", "grade"],
};

const stageGradingOrder: JsonFieldOrder = {
	children: {
		dimensions: dimensionsOrder,
		hardBlockers: hardBlockersOrder,
		scorecard: digestedPathOrder,
	},
	fields: ["stage", "scorecard", "hardBlockers", "dimensions"],
};

const wordsOrder: JsonFieldOrder = {
	fields: ["state", "words", "reason"],
};

const repsOrder: JsonFieldOrder = {
	children: {
		attempt: digestedPathOrder,
		checks: checksOrder,
		judge: { fields: ["status", "verdict", "detail"] },
		outcomes: outcomesOrder,
		stageGrading: stageGradingOrder,
		stateResults: stateResultsOrder,
		words: wordsOrder,
	},
	fields: [
		"path",
		"sha256",
		"repId",
		"ordinal",
		"attempt",
		"outcomes",
		"checks",
		"judge",
		"stateResults",
		"stageGrading",
		"words",
		"group",
	],
};

const sourceOrder: JsonFieldOrder = {
	children: {
		groups: digestedPathOrder,
		reps: repsOrder,
	},
	fields: ["groups", "reps"],
};

export { digestedPathOrder, sourceOrder };
