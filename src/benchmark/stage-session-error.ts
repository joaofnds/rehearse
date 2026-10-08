import type { ProviderCall } from "./contracts";

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/**
 * What a stage session spent up to a point: the calls it made, none before
 * its first, and their spend, unknown when the last call reported none,
 * since a resumed call's total covers the calls before it and the calls'
 * sum would otherwise read as the whole.
 */
export interface SessionSpend {
	readonly providerCalls: readonly ProviderCall[];
	readonly costUsd: number | undefined;
}

export interface StageSessionFailure extends SessionSpend {
	readonly cause: unknown;
}

/** A stage session that failed, carrying what it spent up to the failure. */
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
