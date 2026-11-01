import { describe, expect, it } from "bun:test";

import { STAGE_JUDGE_CONTRACT_SHA256 } from "./judge-contract";
import StageJudgeInputBuilder from "./run-abort-stage-input-builder";
import { runStageJudge } from "./stage-grading";
import { judgeResponse, rubricSource } from "./stage-judge-test-fixtures";
import { judgeBudget } from "./test-support";

async function preservesStageContract(): Promise<void> {
	const input = new StageJudgeInputBuilder().build();
	const execution = {
		budget: judgeBudget(),
		effort: undefined,
		model: "sonnet",
	};
	const hooks = {
		invoke: async () => await Promise.resolve(judgeResponse("backlog-seed.md")),
	};
	const first = await runStageJudge(
		execution,
		{ input, source: rubricSource },
		hooks,
	);
	const second = await runStageJudge(
		execution,
		{
			evidenceOrigin: "record",
			input: { ...input, instructions: "Different candidate instructions" },
			source: {
				...rubricSource,
				content: "A different rubric",
				rubric: {
					...rubricSource.rubric,
					requirements: [
						{ description: "Different rubric description", id: "scope" },
					],
				},
			},
		},
		hooks,
	);
	expect(first.prompt).not.toBe(second.prompt);
	expect(first.judgeContractSha256).toBe(STAGE_JUDGE_CONTRACT_SHA256);
	expect(second.judgeContractSha256).toBe(first.judgeContractSha256);
}

async function recordsAttemptedContract(): Promise<void> {
	const observed: string[] = [];
	const observedAtInvocation: string[] = [];
	const result = runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input: new StageJudgeInputBuilder().build(), source: rubricSource },
		{
			invoke: async () => {
				observedAtInvocation.push(...observed);
				return await Promise.reject(new Error("provider failed"));
			},
			onInvocation: (digest) => {
				observed.push(digest);
			},
		},
	);
	expect(result).rejects.toMatchObject({
		judgeContractSha256: STAGE_JUDGE_CONTRACT_SHA256,
	});
	await Promise.allSettled([result]);
	expect(observed).toEqual([STAGE_JUDGE_CONTRACT_SHA256]);
	expect(observedAtInvocation).toEqual([STAGE_JUDGE_CONTRACT_SHA256]);
}

describe("stage Judge instruction identity", () => {
	it(
		"preserves identity across candidate, rubric and record-origin substitutions",
		preservesStageContract,
	);
	it(
		"records the attempted contract before an invocation fails",
		recordsAttemptedContract,
	);
});
