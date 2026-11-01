import { claudeArgs, runJsonSession } from "./claude";
import type { SessionSettings } from "./claude";
import { CLAUDE_TIMEOUT_MS } from "./config";
import { judgeGradeResponseSchema } from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import { SESSION_JUDGE_SYSTEM_PROMPT } from "./session-judge-prompt";

function sessionJudgeInvoker(
	directory: string,
	settings: SessionSettings,
): JudgeInvoker {
	return async (prompt, budgetUsd) =>
		await runJsonSession(
			claudeArgs({
				access: "sealed",
				schema: judgeGradeResponseSchema,
				settings: { ...settings, budgetUsd },
				systemPrompt: SESSION_JUDGE_SYSTEM_PROMPT,
			}),
			directory,
			{ input: prompt, timeoutMs: CLAUDE_TIMEOUT_MS },
		);
}

export { sessionJudgeInvoker as default };
