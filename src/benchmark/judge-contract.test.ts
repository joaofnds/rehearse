import { describe, expect, it } from "bun:test";

import { claudeArgs } from "./claude";
import {
	judgeGradeResponseSchema,
	stageJudgeResponseSchema,
} from "./contracts";
import type { ContextFile } from "./contracts";
import { runJudge } from "./judge";
import {
	FINAL_JUDGE_CONTRACT,
	FINAL_JUDGE_CONTRACT_SHA256,
	STAGE_JUDGE_CONTRACT,
	STAGE_JUDGE_CONTRACT_SHA256,
	judgeContractSha256,
} from "./judge-contract";
import {
	DIFF,
	RUBRIC_IDS,
	completeGrade,
	passingChecks,
	response,
} from "./judge-test-fixtures";
import { judgeBudget } from "./test-support";

const CONTRACT_FIELDS = [
	"systemPrompt",
	"promptTemplate",
	"responseSchema",
	"retryTemplate",
	"evidenceDefinition",
] as const;

async function judgeCandidate(
	guidance: string,
	baselineContext: readonly ContextFile[],
): ReturnType<typeof runJudge> {
	const candidate = {
		baselineContext,
		changedPaths: ["src/audit/example.ts"],
		checkIntegrity: passingChecks,
		diff: DIFF,
		localChecks: passingChecks,
		rubric: RUBRIC_IDS.map((id) => `1. \`${id}\`: ${guidance}`).join("\n"),
	};
	return await runJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		candidate,
		async () => await Promise.resolve(response(completeGrade("PASS"))),
	);
}

async function preservesFinalContract(): Promise<void> {
	const first = await judgeCandidate("Original", []);
	const second = await judgeCandidate("Different rubric", [
		{ content: "different candidate", path: "extra.ts" },
	]);
	expect(second.prompt).not.toBe(first.prompt);
	expect(first.judgeContractSha256).toBe(FINAL_JUDGE_CONTRACT_SHA256);
	expect(second.judgeContractSha256).toBe(first.judgeContractSha256);
	expect(STAGE_JUDGE_CONTRACT_SHA256).not.toBe(FINAL_JUDGE_CONTRACT_SHA256);
}

describe("recorded Judge contracts", () => {
	it.each([...CONTRACT_FIELDS])(
		"changes identity when fixed %s changes",
		(field) => {
			expect(
				judgeContractSha256({
					...FINAL_JUDGE_CONTRACT,
					[field]: `${FINAL_JUDGE_CONTRACT[field]} changed`,
				}),
			).not.toBe(FINAL_JUDGE_CONTRACT_SHA256);
			expect(
				judgeContractSha256({
					...STAGE_JUDGE_CONTRACT,
					[field]: `${STAGE_JUDGE_CONTRACT[field]} changed`,
				}),
			).not.toBe(STAGE_JUDGE_CONTRACT_SHA256);
		},
	);

	it("uses the schema and system text emitted by live provider arguments", () => {
		for (const [contract, schema] of [
			[FINAL_JUDGE_CONTRACT, judgeGradeResponseSchema],
			[STAGE_JUDGE_CONTRACT, stageJudgeResponseSchema],
		] as const) {
			const args = claudeArgs({
				access: "sealed",
				schema,
				settings: { budgetUsd: 1, effort: undefined, model: "sonnet" },
				systemPrompt: contract.systemPrompt,
			});
			expect(args).toContain(contract.responseSchema);
			expect(args).toContain(contract.systemPrompt);
		}
	});

	it(
		"records the same final contract while the candidate evidence changes",
		preservesFinalContract,
	);
});
