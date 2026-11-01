import { describe, expect, it } from "bun:test";

import JudgeResponseScript from "./judge-script-test-fixture";
import runSessionJudge from "./session-judge";
import { SESSION_JUDGE_CONTRACT_SHA256 } from "./session-judge-prompt";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "./session-judge-test-fixtures";
import { createSpendCeiling } from "./spend-ceiling";

const EXHAUSTED_CEILING_USD = 1;
const SINGLE_PAID_CALL = 1;
const REJECTED_AND_FAILED_COST_USD = 0.3;

describe("session Judge failures before invocation", () => {
	it("withholds a grade without paying when required evidence is unavailable", async () => {
		const script = new JudgeResponseScript([]);
		const request = sessionJudgeRequest(script.invoke);

		const result = await runSessionJudge({
			...request,
			input: { files: [], unavailable: ["The attempt retained no reply."] },
		});

		expect(result).toMatchObject({
			attempts: [],
			costUsd: 0,
			providerCalls: [],
			status: "UNAVAILABLE",
		});
		expect(result).not.toHaveProperty("grade");
		expect(result).not.toHaveProperty("judgeContractSha256");
		expect(script.prompts).toEqual([]);
	});

	it("refuses the first Judge call after the worker exhausted the ceiling", async () => {
		const script = new JudgeResponseScript([]);
		const request = sessionJudgeRequest(script.invoke);
		const spendCeiling = createSpendCeiling({
			ceilingUsd: EXHAUSTED_CEILING_USD,
		});
		spendCeiling.charge(EXHAUSTED_CEILING_USD);

		const result = await runSessionJudge({ ...request, spendCeiling });

		expect(result).toMatchObject({
			attempts: [],
			costUsd: 0,
			providerCalls: [],
			status: "ERROR",
		});
		expect(result.judgeContractSha256).toBeUndefined();
		expect(script.prompts).toEqual([]);
	});
});

describe("session Judge failures after invocation", () => {
	it("retains a paid invalid response when the ceiling refuses its retry", async () => {
		const script = new JudgeResponseScript([
			sessionJudgeResponse({ path: "missing.txt" }),
		]);
		const request = sessionJudgeRequest(script.invoke);

		const result = await runSessionJudge({
			...request,
			spendCeiling: createSpendCeiling({ ceilingUsd: 0.1 }),
		});

		expect(result).toMatchObject({
			attempts: [{ outcome: "REJECTED" }],
			costUsd: 0.1,
			judgeContractSha256: SESSION_JUDGE_CONTRACT_SHA256,
			status: "ERROR",
		});
		expect(result.providerCalls).toHaveLength(SINGLE_PAID_CALL);
	});
});

async function retainsRejectedAndFailedCalls(): Promise<void> {
	const script = new JudgeResponseScript([
		sessionJudgeResponse({ path: "missing.txt" }),
		JSON.stringify({
			errors: ["Budget halted"],
			is_error: true,
			num_turns: 1,
			session_id: "halted",
			total_cost_usd: 0.2,
			usage: {
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
				input_tokens: 7,
				output_tokens: 3,
			},
		}),
	]);

	const result = await runSessionJudge(sessionJudgeRequest(script.invoke));

	expect(result).toMatchObject({
		attempts: [{ outcome: "REJECTED" }],
		judgeContractSha256: SESSION_JUDGE_CONTRACT_SHA256,
		providerCalls: [
			{ metrics: { costUsd: 0.1 } },
			{ metrics: { costUsd: 0.2 } },
		],
		status: "ERROR",
	});
	expect(result.costUsd).toBeCloseTo(REJECTED_AND_FAILED_COST_USD);
	expect(result).not.toHaveProperty("grade");
}

describe("session Judge failed call metrics", () => {
	it(
		"retains rejected and failed calls with their cost and metrics",
		retainsRejectedAndFailedCalls,
	);
});
