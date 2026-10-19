import { describe, expect, it } from "bun:test";

import { readClaudeEnvelope } from "./claude";
import JudgeResponseScript from "./judge-script-test-fixture";
import { runStageJudge } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import { judgeResponse, rubricSource } from "./stage-judge-test-fixtures";
import { judgeBudget } from "./test-support";

const EXPECTED_RETRY_PROMPT_COUNT = 2;
const EXPECTED_RETRY_COST_USD = 0.2;
const RETRY_PROMPT_INDEX = 1;

const CALL_COUNT_INCREMENT = 1;

async function retriesQuotedRejectionAndSumsCosts(): Promise<void> {
	const responses = [
		judgeResponse("not-a-path"),
		judgeResponse("backlog-seed.md"),
	];
	const [observedFirstPayload, observedSecondPayload] = responses.map(
		(response) => readClaudeEnvelope(response).structured_output,
	);
	const script = new JudgeResponseScript(responses);

	const scorecard = await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input: stageJudgeInput("shape"), source: rubricSource },
		{
			invoke: script.invoke,
		},
	);

	expect(script.prompts).toHaveLength(EXPECTED_RETRY_PROMPT_COUNT);
	expect(script.prompts[RETRY_PROMPT_INDEX]).toContain(
		"Your previous response was rejected",
	);
	expect(script.prompts[RETRY_PROMPT_INDEX]).toContain("not-a-path");
	expect(scorecard.attempts).toEqual([
		{
			costUsd: 0.1,
			error:
				"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
			outcome: "REJECTED",
			payload: observedFirstPayload,
		},
		{
			costUsd: 0.1,
			outcome: "ACCEPTED",
			payload: observedSecondPayload,
		},
	]);
	expect(scorecard.costUsd).toBeCloseTo(EXPECTED_RETRY_COST_USD);
	expect(scorecard.grade.grade).toBe("A");
}

function retainsBothRejectedAttemptsAtRetryLimit(): void {
	const expectedCalls = 2;

	let calls = 0;
	const response = judgeResponse("not-a-path");
	const payload = readClaudeEnvelope(response).structured_output;

	expect(
		runStageJudge(
			{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
			{ input: stageJudgeInput("shape"), source: rubricSource },
			{
				invoke: async () => {
					calls += CALL_COUNT_INCREMENT;

					return await Promise.resolve(response);
				},
			},
		),
	).rejects.toMatchObject({
		attempts: [
			{
				costUsd: 0.1,
				error:
					"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
				outcome: "REJECTED",
				payload,
			},
			{
				costUsd: 0.1,
				error:
					"Stage Judge cited unavailable evidence for invalid-stage-delivery: task:not-a-path",
				outcome: "REJECTED",
				payload,
			},
		],
		costUsd: 0.2,
		name: "JudgeOutputValidationError",
	});
	expect(calls).toBe(expectedCalls);
}

describe(runStageJudge.name, () => {
	it(
		"retries once with the rejection quoted and sums the costs",
		retriesQuotedRejectionAndSumsCosts,
	);

	it(
		"fails with both rejected attempts after the second invalid response",
		retainsBothRejectedAttemptsAtRetryLimit,
	);
});
