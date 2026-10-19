import type { StageRubric } from "#benchmark/contracts";

const RUBRIC: StageRubric = {
	dimensions: [
		{
			description: "How clearly the task reads.",
			excellent: "A reads at a glance.",
			good: "B reads clearly.",
			id: "clarity",
		},
		{
			description: "How well decisions are framed.",
			excellent: "A orders them by consequence.",
			good: "B frames each decision.",
			id: "decision-quality",
		},
	],
	hardBlockers: [
		{
			description: "The stage left no valid task state.",
			id: "invalid-stage-delivery",
		},
	],
	requirements: [
		{ description: "The task states its goal.", id: "goal-stated" },
	],
};

const INPUT = {
	kind: "planning",
	productBrief: "An audit log for every write",
	stage: "shape",
	task: "Implement the audit log",
	transcript: "the stage's transcript",
};

const JUDGE_SUMMARY = "Judge summary: clarity and decision quality both read";

const JUDGE_CLAIM = "Judge claim: the task state is valid";

export { RUBRIC, INPUT, JUDGE_SUMMARY, JUDGE_CLAIM };
