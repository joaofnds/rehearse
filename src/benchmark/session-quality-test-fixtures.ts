import { join } from "node:path";

import type { SessionCase } from "./case";
import type { ConfirmationGroupOutcome } from "./confirmation-evidence";
import { runSessionConfirmation } from "./session-confirmation";
import {
	confirmationRequest,
	recordedAttempt,
	simpleSessionCase,
} from "./session-confirmation-test-fixtures";
import { instructionCorpus } from "./session-confirmation-workspace-test-fixtures";
import runSessionJudge from "./session-judge";
import type { SessionJudgeRecord } from "./session-judge-contract";
import { createSpendCeiling } from "./spend-ceiling";

const GROUP_JUDGE_RUBRIC = "1. `answer`: The reply answers the task.\n";

function judgedSessionCase(sessionCase: SessionCase): SessionCase {
	return {
		...sessionCase,
		declaration: {
			...sessionCase.declaration,
			judge: { files: [], rubric: "rubric.md" },
		},
		judge: {
			files: [],
			rubric: GROUP_JUDGE_RUBRIC,
			rubricPath: "/case/rubric.md",
		},
	};
}

async function failingSessionJudge(): Promise<SessionJudgeRecord> {
	return await runSessionJudge({
		definition: {
			files: [],
			rubric: GROUP_JUDGE_RUBRIC,
			rubricPath: "/case/rubric.md",
		},
		input: { files: [{ content: "OK", path: "reply.txt" }], unavailable: [] },
		invoke: async () =>
			await Promise.resolve(
				JSON.stringify({
					num_turns: 1,
					session_id: "group-judge",
					structured_output: {
						requirements: [
							{
								evidence: [
									{
										claim: "No answer is supplied.",
										path: "reply.txt",
										quote: "OK",
										source: "baseline-context",
									},
								],
								id: "answer",
								status: "FAIL",
							},
						],
						summary: "The reply does not answer the task.",
						verdict: "FAIL",
					},
					total_cost_usd: 0.04,
					usage: {
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
						input_tokens: 5,
						output_tokens: 3,
					},
				}),
			),
		settings: { budgetUsd: 0.2, model: "sonnet" },
		spendCeiling: createSpendCeiling({ ceilingUsd: 100 }),
	});
}

async function judgedSessionGroup(
	suppliedJudge?: SessionJudgeRecord,
): Promise<ConfirmationGroupOutcome> {
	const { root, corpusRoot } = await instructionCorpus(
		"rehearse-session-judge-group-",
		{ "CLAUDE.md": "instructions\n" },
	);
	const judge = suppliedJudge ?? (await failingSessionJudge());
	const sessionCase = judgedSessionCase(simpleSessionCase("judged-group"));
	return await runSessionConfirmation(
		{
			executeAttempt: async (plan) => ({
				...(await recordedAttempt(plan)),
				judge,
			}),
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "judged-group",
			runsDirectory: join(root, "runs"),
			sessionCase,
		}),
	);
}

async function sessionJudgeComparison(): Promise<{
	readonly manifestPath: string;
	readonly runsDirectory: string;
}> {
	const { root, corpusRoot } = await instructionCorpus(
		"rehearse-judge-comparison-",
		{ "CLAUDE.md": "instructions\n" },
	);
	const judge = await failingSessionJudge();
	const sessionCase = judgedSessionCase(simpleSessionCase("judged-case"));
	const runsDirectory = join(root, "runs");
	const groups = await Array.fromAsync(
		["baseline", "candidate", "control"],
		async (arm) => {
			const outcome = await runSessionConfirmation(
				{
					executeAttempt: async (plan) => ({
						...(await recordedAttempt(plan)),
						judge,
					}),
				},
				confirmationRequest({
					corpus: corpusRoot,
					groupId: `judged-${arm}`,
					runsDirectory,
					sessionCase,
				}),
			);
			return [arm, outcome.groupRecordFile] as const;
		},
	);
	const manifestPath = join(root, "comparison.json");
	await Bun.write(
		manifestPath,
		JSON.stringify({
			cases: [{ arms: Object.fromEntries(groups), caseId: "judged-case" }],
			schemaVersion: 1,
		}),
	);
	return { manifestPath, runsDirectory };
}

export {
	GROUP_JUDGE_RUBRIC,
	judgedSessionGroup,
	judgedSessionCase,
	failingSessionJudge,
	sessionJudgeComparison,
};
