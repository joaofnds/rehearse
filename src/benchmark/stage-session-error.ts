import type { ProviderCall } from "./contracts";

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

export interface StageSessionFailure {
	readonly cause: unknown;
	readonly providerCalls: readonly ProviderCall[];
	readonly costUsd: number | undefined;
}

/**
 * A stage session that failed once it had made a call, carrying the calls it
 * made and its spend up to the failure, unknown when its last call reported none.
 */
export class StageSessionError extends Error {
	public readonly providerCalls: readonly ProviderCall[];
	public readonly costUsd: number | undefined;

	public constructor(props: StageSessionFailure, prefix = "") {
		super(`${prefix}${reasonOf(props.cause)}`, { cause: props.cause });
		this.name = "StageSessionError";
		this.providerCalls = props.providerCalls;
		this.costUsd = props.costUsd;
	}
}
