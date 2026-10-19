import {
	UNPRICED_REASONS,
	costFromRate,
	usageIsZero,
} from "./context-evidence-contract";
import type { ContextRateCatalog } from "./context-evidence-contract";
import type { PricedTokenUsage } from "./context-evidence-rates-contract";
import {
	NO_CATALOG,
	USAGE_INCOMPLETE,
} from "./session-history-request-contract";
import type {
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "./session-history-request-contract";

type PricedRequest =
	| { readonly state: "priced"; readonly costUsd: number }
	| { readonly state: "unpriced"; readonly reason: string };

function pricedRequest(
	entry: SessionHistoryRequestEntry,
	rates: ContextRateCatalog,
): PricedRequest {
	const identity = settledPricingModel(entry);
	if (identity.state === "unpriced") {
		return identity;
	}
	return priceSettledUsage(identity, rates);
}

type SessionHistoryRequestCost = PricedRequest;

/**
 * The same `pricedRequest` the summed reading uses, keyed by transcript line so
 * a row and the total can never disagree about what a request cost. Only
 * attempt-region requests are priced, because only those are what the summed
 * reading counts; a starting-context request is absent rather than zero.
 */
function sessionHistoryRequestCosts(
	series: Readonly<SessionHistoryRequestSeries>,
	rates: ContextRateCatalog | undefined,
): ReadonlyMap<number, SessionHistoryRequestCost> {
	const costs = new Map<number, SessionHistoryRequestCost>();
	for (const entry of series.entries) {
		if (entry.region === "attempt") {
			costs.set(
				entry.line,
				rates === undefined
					? { reason: NO_CATALOG, state: "unpriced" }
					: pricedRequest(entry, rates),
			);
		}
	}

	return costs;
}

type CompleteRequestEntry = Extract<
	SessionHistoryRequestEntry,
	{ usageState: "complete" }
>;

interface SettledPricingIdentity {
	readonly state: "ready";
	readonly entry: CompleteRequestEntry;
	readonly model: string;
}

function settledPricingModel(
	entry: SessionHistoryRequestEntry,
): SettledPricingIdentity | Extract<PricedRequest, { state: "unpriced" }> {
	if (entry.usageState === "incomplete") {
		return { reason: USAGE_INCOMPLETE, state: "unpriced" };
	}
	if (entry.usageState !== "complete") {
		return { reason: UNPRICED_REASONS["usage-conflict"], state: "unpriced" };
	}
	if (entry.modelState === "conflict") {
		return { reason: UNPRICED_REASONS["model-conflict"], state: "unpriced" };
	}
	const { model } = entry;
	if (model === undefined) {
		return { reason: UNPRICED_REASONS["model-missing"], state: "unpriced" };
	}
	return { entry, model, state: "ready" };
}

function priceSettledUsage(
	{ entry, model }: SettledPricingIdentity,
	rates: ContextRateCatalog,
): PricedRequest {
	const split = entry.cacheWriteSplit;
	if (split.state === "conflict") {
		return {
			reason: UNPRICED_REASONS["ttl-split-conflict"],
			state: "unpriced",
		};
	}
	if (split.state !== "complete") {
		return { reason: UNPRICED_REASONS["ttl-split-missing"], state: "unpriced" };
	}
	const usage = {
		cacheReadTokens: entry.usage.cacheReadTokens,
		cacheWrite1hTokens: split.oneHourTokens,
		cacheWrite5mTokens: split.fiveMinuteTokens,
		inputTokens: entry.usage.inputTokens,
		outputTokens: entry.usage.outputTokens,
	};
	return costUsingRate({ model, usage }, rates);
}

interface ModelPricedUsage {
	readonly model: string;
	readonly usage: PricedTokenUsage;
}

function costUsingRate(
	{ model, usage }: ModelPricedUsage,
	rates: ContextRateCatalog,
): PricedRequest {
	if (usageIsZero(usage)) {
		return { costUsd: 0, state: "priced" };
	}
	const rate = rates.models.find((candidate) => candidate.model === model);
	if (rate === undefined) {
		return { reason: UNPRICED_REASONS["rates-missing"], state: "unpriced" };
	}
	return { costUsd: costFromRate(usage, rate), state: "priced" };
}

export { sessionHistoryRequestCosts, pricedRequest };

export type { SessionHistoryRequestCost };
