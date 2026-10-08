import type { ProviderCall } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import { judgeProviderCalls } from "./judge-execution-error";
import { SpendCeilingReachedError } from "./spend-ceiling";

/**
 * The ceiling refused a judge attempt after earlier attempts were paid for.
 * It carries those attempts, so the record keeps what the refused call's
 * predecessors cost.
 */
export class JudgeCeilingStopError extends SpendCeilingReachedError {
	public override name = "JudgeCeilingStopError";
	public readonly prompt: string;
	public readonly attempts: readonly JudgeAttempt[];
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number;

	public constructor(props: {
		readonly ceilingUsd: number;
		readonly spentUsd: number;
		readonly prompt: string;
		readonly attempts: readonly JudgeAttempt[];
		readonly costUsd: number;
	}) {
		super({ ceilingUsd: props.ceilingUsd, spentUsd: props.spentUsd });
		this.prompt = props.prompt;
		this.attempts = props.attempts;
		this.providerCalls = judgeProviderCalls(props.attempts);
		this.costUsd = props.costUsd;
	}
}
