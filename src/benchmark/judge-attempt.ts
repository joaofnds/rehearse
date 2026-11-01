import {
	ClaudeSessionError,
	readClaudeCallMetrics,
	readClaudeEnvelope,
} from "./claude";
import type { ClaudeCallMetrics, ClaudeEnvelope } from "./contracts";
import JudgeOutputValidationError from "./judge-attempt-contract";
import type {
	JudgeAttempt,
	JudgeAttemptEvidence,
	JudgeAttemptExecution,
	JudgeAttemptResult,
	JudgeAttemptWithoutMetrics,
	JudgeBudget,
} from "./judge-attempt-contract";
import JudgeCeilingStopError from "./judge-ceiling-stop-error";
import { JudgeExecutionError } from "./judge-execution-error";
import {
	RETRY_JUDGE_TEMPLATE,
	renderJudgeTemplate,
} from "./judge-prompt-templates";
import serialMap from "./serial-map";
import { SpendCeilingReachedError } from "./spend-ceiling";

const ORDINAL_BASE = 1;
const NO_REPORTED_COST_USD = 0;
const MAX_JUDGE_ATTEMPTS = 2;
const NO_JUDGE_ATTEMPTS = 0;
function withMetrics(
	attempt: JudgeAttemptWithoutMetrics,
	metrics: ClaudeCallMetrics | undefined,
): JudgeAttempt {
	if (metrics === undefined) {
		return attempt;
	}

	return { ...attempt, metrics };
}
interface JudgeResponseInspection {
	readonly attempt: number;
	readonly envelope: ClaudeEnvelope;
}
class JudgeAttempts<Value> {
	private costUsd = NO_REPORTED_COST_USD;
	private readonly attempts: JudgeAttempt[] = [];
	private attemptPrompt: string;
	public constructor(
		private readonly prompt: string,
		private readonly execution: JudgeAttemptExecution<Value>,
		private readonly budget: JudgeBudget,
	) {
		this.attemptPrompt = prompt;
	}
	private judgeBudget(): number {
		try {
			return this.budget.spendCeiling.budgetFor(this.budget.sessionBudgetUsd);
		} catch (error) {
			if (error instanceof SpendCeilingReachedError) {
				throw new JudgeCeilingStopError({
					attempts: this.attempts,
					ceilingUsd: error.ceilingUsd,
					costUsd: this.costUsd,
					judgeContractSha256:
						this.attempts.length > NO_JUDGE_ATTEMPTS
							? this.execution.judgeContractSha256
							: undefined,
					prompt: this.prompt,
					spentUsd: error.spentUsd,
				});
			}

			throw error;
		}
	}
	private async callJudge(budgetUsd: number): Promise<string> {
		if (this.execution.judgeContractSha256 !== undefined) {
			this.execution.onInvocation?.(this.execution.judgeContractSha256);
		}
		return await this.execution.invoke(this.attemptPrompt, budgetUsd);
	}
	private async invokeJudge(budgetUsd: number): Promise<ClaudeEnvelope> {
		try {
			const output = await this.callJudge(budgetUsd);

			return readClaudeEnvelope(output);
		} catch (error) {
			const halt = error instanceof ClaudeSessionError ? error : undefined;
			const failedCallCostUsd = halt?.costUsd ?? NO_REPORTED_COST_USD;
			const failedCallMetrics =
				halt === undefined ? undefined : readClaudeCallMetrics(halt.envelope);
			this.budget.spendCeiling.charge(failedCallCostUsd, failedCallMetrics);

			throw new JudgeExecutionError({
				attempts: this.attempts,
				cause: error,
				costUsd: this.costUsd + failedCallCostUsd,
				failedCallMetrics,
				judgeContractSha256: this.execution.judgeContractSha256,
				prompt: this.prompt,
			});
		}
	}
	private responses(): AsyncGenerator<JudgeResponseInspection> {
		return serialMap(
			Array.from(
				{ length: MAX_JUDGE_ATTEMPTS },
				(_value, index) => index + ORDINAL_BASE,
			).values(),
			async (attempt) => ({
				attempt,
				envelope: await this.invokeJudge(this.judgeBudget()),
			}),
		);
	}
	private charge(envelope: ClaudeEnvelope): JudgeAttemptEvidence {
		const attemptCostUsd = envelope.total_cost_usd ?? NO_REPORTED_COST_USD;
		const metrics = readClaudeCallMetrics(envelope);
		const payload = envelope.structured_output ?? envelope.result ?? null;
		this.costUsd += attemptCostUsd;
		this.budget.spendCeiling.charge(attemptCostUsd, metrics);

		return { costUsd: attemptCostUsd, metrics, payload };
	}
	private accept(
		envelope: ClaudeEnvelope,
		evidence: JudgeAttemptEvidence,
	): Value {
		const { validate } = this.execution;
		const value = validate(envelope);
		this.attempts.push(
			withMetrics(
				{
					costUsd: evidence.costUsd,
					outcome: "ACCEPTED",
					payload: evidence.payload,
				},
				evidence.metrics,
			),
		);

		return value;
	}
	private reject(
		reason: string,
		attempt: number,
		evidence: JudgeAttemptEvidence,
	): void {
		this.attempts.push(
			withMetrics(
				{
					costUsd: evidence.costUsd,
					error: reason,
					outcome: "REJECTED",
					payload: evidence.payload,
				},
				evidence.metrics,
			),
		);
		if (attempt >= MAX_JUDGE_ATTEMPTS) {
			throw new JudgeOutputValidationError({
				attempts: this.attempts,
				costUsd: this.costUsd,
				judgeContractSha256: this.execution.judgeContractSha256,
				message: reason,
				prompt: this.prompt,
			});
		}

		const feedback = JSON.stringify({ validationError: reason });
		this.attemptPrompt = renderJudgeTemplate(RETRY_JUDGE_TEMPLATE, {
			feedback,
			prompt: this.prompt,
		});
	}
	public async run(): Promise<JudgeAttemptResult<Value>> {
		for await (const { attempt, envelope } of this.responses()) {
			const evidence = this.charge(envelope);
			try {
				const value = this.accept(envelope, evidence);
				return { attempts: this.attempts, costUsd: this.costUsd, value };
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				this.reject(reason, attempt, evidence);
			}
		}
		throw new Error("Judge attempt schedule ended without a result");
	}
}
async function runJudgeAttempts<Value>(
	prompt: string,
	execution: JudgeAttemptExecution<Value>,
	budget: JudgeBudget,
): Promise<JudgeAttemptResult<Value>> {
	return await new JudgeAttempts(prompt, execution, budget).run();
}
export { MAX_JUDGE_ATTEMPTS, runJudgeAttempts };
export { default as JudgeOutputValidationError } from "./judge-attempt-contract";
export type {
	JudgeInvoker,
	JudgeBudget,
	JudgeAttempt,
	JudgeAttemptResult,
} from "./judge-attempt-contract";
export { JudgeExecutionError } from "./judge-execution-error";
