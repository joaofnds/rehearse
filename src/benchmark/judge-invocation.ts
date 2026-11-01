import { claudeArgs, runJsonSession, runStreamedSession } from "./claude";
import type { Effort } from "./config";
import { CLAUDE_TIMEOUT_MS } from "./config";
import {
	judgeGradeResponseSchema,
	stageJudgeResponseSchema,
} from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import {
	FINAL_JUDGE_SYSTEM_PROMPT,
	STAGE_JUDGE_SYSTEM_PROMPT,
} from "./judge-system-prompts";
import type { StageJudgeInvoker } from "./stage-judge-progress";

interface JudgeSettings {
	readonly model: string;
	readonly effort: Effort | undefined;
}

function finalJudgeInvoker(
	judgeDirectory: string,
	{ model, effort }: JudgeSettings,
): JudgeInvoker {
	return async (judgePrompt, budgetUsd) =>
		await runJsonSession(
			claudeArgs({
				access: "sealed",
				schema: judgeGradeResponseSchema,
				settings: { budgetUsd, effort, model },
				systemPrompt: FINAL_JUDGE_SYSTEM_PROMPT,
			}),
			judgeDirectory,
			{ input: judgePrompt, timeoutMs: CLAUDE_TIMEOUT_MS },
		);
}

function stageJudgeInvoker(
	judgeDirectory: string,
	{ model, effort }: JudgeSettings,
): StageJudgeInvoker {
	return async (judgePrompt, onLine, budgetUsd) =>
		await runStreamedSession(
			claudeArgs({
				access: "sealed",
				output: "stream",
				schema: stageJudgeResponseSchema,
				settings: { budgetUsd, effort, model },
				systemPrompt: STAGE_JUDGE_SYSTEM_PROMPT,
			}),
			judgeDirectory,
			{ input: judgePrompt, onLine, timeoutMs: CLAUDE_TIMEOUT_MS },
		);
}

export { finalJudgeInvoker, stageJudgeInvoker };
export type { JudgeSettings };
