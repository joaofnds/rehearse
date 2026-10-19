import type {
	ClaudeCallMetrics,
	ClaudeEnvelope,
	ProviderCall,
} from "./contracts";
import { judgeProviderCalls } from "./judge-execution-error";
import type { SpendCeiling } from "./spend-ceiling";

type JudgeInvoker = (prompt: string, budgetUsd: number) => Promise<string>;

/**
 * What one Judge attempt may spend: its own session budget, clamped to the
 * spend ceiling the run has left.
 */
interface JudgeBudget {
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
}

interface JudgeAttemptEvidence {
	readonly payload: unknown;
	readonly costUsd: number;
	readonly metrics?: ClaudeCallMetrics | undefined;
}

type JudgeAttemptOutcome =
	| { readonly outcome: "ACCEPTED" }
	| { readonly outcome: "REJECTED"; readonly error: string };

type JudgeAttempt = JudgeAttemptEvidence & JudgeAttemptOutcome;

type JudgeAttemptWithoutMetrics = Omit<JudgeAttemptEvidence, "metrics"> &
	JudgeAttemptOutcome;

class JudgeOutputValidationError extends Error {
	public override name = "JudgeOutputValidationError";
	public readonly prompt: string;
	public readonly attempts: readonly JudgeAttempt[];
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number;

	public constructor(props: {
		readonly message: string;
		readonly prompt: string;
		readonly attempts: readonly JudgeAttempt[];
		readonly costUsd: number;
	}) {
		super(props.message);
		this.prompt = props.prompt;
		this.attempts = props.attempts;
		this.providerCalls = judgeProviderCalls(props.attempts);
		this.costUsd = props.costUsd;
	}
}

interface JudgeAttemptResult<Value> {
	readonly value: Value;
	readonly attempts: readonly JudgeAttempt[];
	readonly costUsd: number;
}

interface JudgeAttemptExecution<Value> {
	readonly invoke: JudgeInvoker;
	readonly validate: (envelope: ClaudeEnvelope) => Value;
}
export { JudgeOutputValidationError as default };
export type {
	JudgeInvoker,
	JudgeBudget,
	JudgeAttemptEvidence,
	JudgeAttempt,
	JudgeAttemptWithoutMetrics,
	JudgeAttemptResult,
	JudgeAttemptExecution,
};
