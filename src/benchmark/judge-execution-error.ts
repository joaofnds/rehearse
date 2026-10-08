import type { ClaudeCallMetrics, ProviderCall } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";

export function judgeProviderCalls(
	attempts: readonly JudgeAttempt[],
): ProviderCall[] {
	return attempts.map(({ metrics }) =>
		metrics === undefined ? {} : { metrics },
	);
}

export class JudgeExecutionError extends Error {
	public readonly prompt: string;
	public readonly attempts: readonly JudgeAttempt[];
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number;

	public constructor(props: {
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
