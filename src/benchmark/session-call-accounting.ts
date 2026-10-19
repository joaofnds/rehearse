import { readClaudeCallMetrics } from "./claude";
import type { ClaudeEnvelope, ProviderCall } from "./contracts";
import type { SpendCeiling } from "./spend-ceiling";
import type { SessionSpend } from "./stage-session-error";

const EXHAUSTED_BUDGET_USD = 0;

function sessionSpendUsd(envelope: ClaudeEnvelope, spentUsd: number): number {
	return envelope.total_cost_usd ?? spentUsd;
}

function providerCall(
	envelope: ClaudeEnvelope,
	spentUsd: number,
): ProviderCall {
	const metrics = readClaudeCallMetrics(envelope);
	if (metrics === undefined) {
		return {};
	}

	return {
		metrics: {
			...metrics,
			costUsd: sessionSpendUsd(envelope, spentUsd) - spentUsd,
		},
	};
}

/** The calls one provider session made and the spend they add up to. */
interface SessionCalls {
	readonly spentUsd: () => number;
	readonly providerCalls: () => ProviderCall[];
	readonly reading: () => SessionSpend;
	/** Records a call the provider reported, charging the ceiling what it added. */
	readonly record: (envelope: ClaudeEnvelope) => void;
	/** Records a call that failed before the provider reported anything. */
	readonly recordUnreported: () => void;
}

function sessionCalls(spendCeiling: SpendCeiling): SessionCalls {
	let spentUsd = 0;
	let lastReportedTotal = true;
	const providerCalls: ProviderCall[] = [];

	return {
		providerCalls: () => [...providerCalls],
		reading: () => ({
			costUsd: lastReportedTotal ? spentUsd : undefined,
			providerCalls: [...providerCalls],
		}),
		record: (envelope) => {
			providerCalls.push(providerCall(envelope, spentUsd));
			spendCeiling.charge(
				sessionSpendUsd(envelope, spentUsd) - spentUsd,
				readClaudeCallMetrics(envelope),
			);
			spentUsd = sessionSpendUsd(envelope, spentUsd);
			lastReportedTotal = envelope.total_cost_usd !== undefined;
		},
		recordUnreported: () => {
			providerCalls.push({});
			lastReportedTotal = false;
		},
		spentUsd: () => spentUsd,
	};
}

function remainingBudget(limitUsd: number, spentUsd: number): number {
	const remaining = limitUsd - spentUsd;
	if (remaining <= EXHAUSTED_BUDGET_USD) {
		throw new Error("Claude session exhausted its budget");
	}

	return remaining;
}

export { sessionCalls, remainingBudget };
export type { SessionCalls };
