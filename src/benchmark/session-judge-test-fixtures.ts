import type { JudgeGradeResponse } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import type { SessionJudgeRequest } from "./session-judge";
import { createSpendCeiling } from "./spend-ceiling";

const REPLY = "The answer is four.";
const RUBRIC = "1. `accuracy`: The reply answers the question accurately.";

interface ResponseOptions {
	readonly id?: string;
	readonly status?: "PASS" | "FAIL";
	readonly path?: string;
	readonly quote?: string;
	readonly source?: JudgeGradeResponse["requirements"][number]["evidence"][number]["source"];
}

function sessionJudgeResponse(options: ResponseOptions = {}): string {
	const status = options.status ?? "PASS";
	return JSON.stringify({
		num_turns: 1,
		session_id: "judge",
		structured_output: {
			requirements: [
				{
					evidence: [
						{
							claim: "The reply answers the question.",
							path: options.path ?? "reply.txt",
							quote: options.quote ?? REPLY,
							source: options.source ?? "baseline-context",
						},
					],
					id: options.id ?? "accuracy",
					status,
				},
			],
			summary: "The reply answers the question.",
			verdict: status,
		},
		total_cost_usd: 0.1,
		usage: {
			cache_creation_input_tokens: 4,
			cache_read_input_tokens: 5,
			input_tokens: 10,
			output_tokens: 2,
		},
	});
}

function sessionJudgeRequest(invoke: JudgeInvoker): SessionJudgeRequest {
	return {
		definition: { files: [], rubric: RUBRIC, rubricPath: "quality.md" },
		input: { files: [{ content: REPLY, path: "reply.txt" }], unavailable: [] },
		invoke,
		settings: { budgetUsd: 2, effort: "high", model: "sonnet" },
		spendCeiling: createSpendCeiling({ ceilingUsd: 3 }),
	};
}

export { REPLY, RUBRIC, sessionJudgeResponse, sessionJudgeRequest };
