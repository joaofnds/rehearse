import type { SessionSettings } from "./claude";
import { runJudgeAttempts } from "./judge-attempt";
import type { JudgeAttemptResult, JudgeInvoker } from "./judge-attempt";
import withJudgeDirectory from "./judge-directory";
import { judgeProviderCalls } from "./judge-execution-error";
import type {
	SessionJudgeDefinition,
	SessionJudgeInput,
	SessionJudgeRecord,
} from "./session-judge-contract";
import { recordedJudgeDefinition } from "./session-judge-contract";
import sessionJudgeFailure from "./session-judge-failure";
import type { SessionJudgeRecordBase } from "./session-judge-failure";
import sessionJudgeInvoker from "./session-judge-invocation";
import {
	SESSION_JUDGE_CONTRACT_SHA256,
	sessionJudgePrompt,
} from "./session-judge-prompt";
import readSessionJudgeGrade from "./session-judge-response";
import type { SpendCeiling } from "./spend-ceiling";

const NO_JUDGE_COST_USD = 0;
const NO_UNAVAILABLE_SOURCES = 0;

interface SessionJudgeRequest {
	readonly definition: SessionJudgeDefinition;
	readonly input: SessionJudgeInput;
	readonly settings: SessionSettings;
	readonly spendCeiling: SpendCeiling;
	readonly invoke?: JudgeInvoker | undefined;
}

function recordBase({
	definition,
	input,
	settings,
}: SessionJudgeRequest): SessionJudgeRecordBase {
	return {
		attempts: [],
		costUsd: NO_JUDGE_COST_USD,
		definition: recordedJudgeDefinition(definition),
		effort: definition.effort ?? settings.effort,
		input,
		model: definition.model ?? settings.model,
		prompt: sessionJudgePrompt(definition.rubric, input),
		providerCalls: [],
		sessionBudgetUsd: definition.sessionBudgetUsd ?? settings.budgetUsd,
	};
}

async function judgeInDirectory(
	request: SessionJudgeRequest,
	base: SessionJudgeRecordBase,
): Promise<
	JudgeAttemptResult<Extract<SessionJudgeRecord, { status: "GRADED" }>["grade"]>
> {
	const settings = {
		budgetUsd: base.sessionBudgetUsd,
		effort: base.effort,
		model: base.model,
	};
	return await withJudgeDirectory(
		"rehearse-session-judge-",
		async (directory) =>
			await runJudgeAttempts(
				base.prompt,
				{
					invoke: request.invoke ?? sessionJudgeInvoker(directory, settings),
					judgeContractSha256: SESSION_JUDGE_CONTRACT_SHA256,
					validate: (envelope) =>
						readSessionJudgeGrade({
							envelope,
							input: request.input,
							rubric: request.definition.rubric,
						}),
				},
				{
					sessionBudgetUsd: base.sessionBudgetUsd,
					spendCeiling: request.spendCeiling,
				},
			),
	);
}

async function runSessionJudge(
	request: SessionJudgeRequest,
): Promise<SessionJudgeRecord> {
	const base = recordBase(request);
	if (request.input.unavailable.length > NO_UNAVAILABLE_SOURCES) {
		return {
			...base,
			detail: request.input.unavailable.join("; "),
			status: "UNAVAILABLE",
		};
	}
	try {
		const result = await judgeInDirectory(request, base);

		return {
			...base,
			attempts: result.attempts,
			costUsd: result.costUsd,
			grade: result.value,
			judgeContractSha256: SESSION_JUDGE_CONTRACT_SHA256,
			providerCalls: judgeProviderCalls(result.attempts),
			status: "GRADED",
		};
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}

		return sessionJudgeFailure(base, error);
	}
}

export { runSessionJudge as default };
export type { SessionJudgeRequest };
