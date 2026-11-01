import type { ClaudeCallMetrics, ProviderCall } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";

function judgeProviderCalls(attempts: readonly JudgeAttempt[]): ProviderCall[] {
	return attempts.map(({ metrics }) =>
		metrics === undefined ? {} : { metrics },
	);
}

class JudgeExecutionError extends Error {
	public readonly prompt: string;
	public readonly judgeContractSha256: string | undefined;
	public readonly attempts: readonly JudgeAttempt[];
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number;

	public constructor(props: {
		readonly judgeContractSha256?: string | undefined;
		readonly cause: unknown;
		readonly prompt: string;
		readonly attempts: readonly JudgeAttempt[];
		readonly costUsd: number;
		/** What the failed call reported, absent when it reported no usage. */
		readonly failedCallMetrics: ClaudeCallMetrics | undefined;
	}) {
		super(
			props.cause instanceof Error
				? props.cause.message
				: "Judge execution failed",
			{ cause: props.cause },
		);
		this.name = "JudgeExecutionError";
		this.prompt = props.prompt;
		this.judgeContractSha256 = props.judgeContractSha256;
		this.attempts = props.attempts;
		this.providerCalls = [
			...judgeProviderCalls(props.attempts),
			props.failedCallMetrics === undefined
				? {}
				: { metrics: props.failedCallMetrics },
		];
		this.costUsd = props.costUsd;
	}
}

export { judgeProviderCalls, JudgeExecutionError };
