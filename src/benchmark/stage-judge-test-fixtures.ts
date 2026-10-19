import type { StageJudgeOutput, StageScorecard } from "./contracts";
import { runStageJudge } from "./stage-grading";
import { judgeBudget } from "./test-support";

function quotedResponse(
	evidence: readonly (StageJudgeOutput["requirements"][number]["evidence"][number] & {
		readonly quote: string;
	})[],
): string {
	return JSON.stringify({
		session_id: "judge-session",
		structured_output: {
			dimensions: [{ evidence, grade: "A", id: "clarity" }],
			hardBlockers: [
				{ evidence, id: "invalid-stage-delivery", status: "PASS" },
			],
			requirements: [{ evidence, id: "scope", status: "PASS" }],
			summary: "graded",
		},
		total_cost_usd: 0.1,
	});
}

function quotedResponseFor(blockerIds: readonly string[]): string {
	const evidence = [
		{
			claim: "grounded",
			path: "backlog-seed.md",
			quote: "Task",
			source: "task",
		},
	];

	return JSON.stringify({
		session_id: "judge-session",
		structured_output: {
			dimensions: [{ evidence, grade: "A", id: "clarity" }],
			hardBlockers: blockerIds.map((id) => ({
				evidence,
				id,
				status: "PASS",
			})),
			requirements: [{ evidence, id: "scope", status: "PASS" }],
			summary: "graded",
		},
		total_cost_usd: 0.1,
	});
}

function judgeResponse(
	evidencePath: string,
	evidenceSource: StageJudgeOutput["requirements"][number]["evidence"][number]["source"] = "task",
	quote = "Task",
): string {
	return quotedResponse([
		{ claim: "grounded", path: evidencePath, quote, source: evidenceSource },
	]);
}

const rubricSource = {
	content: "{}",
	rubric: {
		dimensions: [
			{ description: "Clear", excellent: "e", good: "g", id: "clarity" },
		],
		hardBlockers: [
			{ description: "Valid delivery", id: "invalid-stage-delivery" },
		],
		requirements: [{ description: "Scope", id: "scope" }],
	},
	rubricPath: "rubrics/shape.json",
};

async function judgedOnce(
	input: StageScorecard["input"],
	response: string,
): Promise<StageScorecard> {
	return await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input, source: rubricSource },
		{
			invoke: async () => await Promise.resolve(response),
		},
	);
}

export {
	quotedResponse,
	quotedResponseFor,
	judgeResponse,
	rubricSource,
	judgedOnce,
};
