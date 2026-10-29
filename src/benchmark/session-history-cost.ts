import type { ContextRateCatalog } from "./context-evidence-contract";
import type {
	SessionHistoryRequestEntry,
	SessionHistoryRequestSeries,
} from "./session-history-request-contract";
import {
	BOUNDARY_ABSENT,
	NO_CATALOG,
	TRANSCRIPT_ABSENT,
} from "./session-history-request-contract";
import { pricedRequest } from "./session-history-request-pricing";

const INITIAL_CALCULATED_COST_USD = 0;

const INITIAL_PRICED_REQUEST_COUNT = 0;

const INITIAL_ATTEMPT_REQUEST_COUNT = 0;

const NO_REQUEST_COUNT_CONTRIBUTION = 0;

/**
 * A billionth of a dollar, a hundredth of the cheapest token's price. Finer
 * digits of a difference are float noise, which the provider's own recorded
 * figures carry, and would read as -$0.00 or as an exact amount of 4e-16.
 */
const DIFFERENCE_DECIMAL_PLACES = 9;

/** Rounding a small negative difference leaves -0, which reads as -$0.00. */
const ZERO_DIFFERENCE_USD = 0;

class AttemptRequestCosts {
	private readonly reasons = new Set<string>();
	private costUsd = INITIAL_CALCULATED_COST_USD;
	private priced = INITIAL_PRICED_REQUEST_COUNT;
	private requestCount = INITIAL_ATTEMPT_REQUEST_COUNT;
	public constructor(private readonly rates: ContextRateCatalog) {}
	public observe(entry: SessionHistoryRequestEntry): void {
		if (entry.region !== "attempt") {
			return;
		}
		this.requestCount += 1;
		const result = pricedRequest(entry, this.rates);
		if (result.state === "priced") {
			this.costUsd += result.costUsd;
			this.priced += 1;
		} else {
			this.reasons.add(result.reason);
		}
	}
	public reading(): SessionHistoryCostReading {
		if (this.priced === this.requestCount) {
			return { costUsd: this.costUsd, state: "complete" };
		}
		return {
			costUsd: this.costUsd,
			pricedRequestCount: this.priced,
			reasons: [...this.reasons],
			requestCount: this.requestCount,
			state: "incomplete",
		};
	}
}

type SessionHistoryCostReading =
	| { readonly state: "complete"; readonly costUsd: number }
	| {
			readonly state: "incomplete";
			readonly costUsd: number;
			readonly pricedRequestCount: number;
			readonly requestCount: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

/**
 * Separate readings, never folded into one. The provider's charge and a sum of
 * per-request calculations answer different questions, and the gap between
 * them is evidence about the catalog rather than an error to hide. Folding
 * them would make a missing rate look like a cost of zero. The provider
 * charges for every agent of the attempt, so an attempt that launched
 * sub-agents reconciles against the calculated reading over every agent,
 * which attemptCostOverAgents draws. Until then the calculated reading and the
 * difference cover the root's requests alone.
 */
interface SessionHistoryAttemptCost {
	readonly reported: SessionHistoryCostReading;
	readonly calculated: SessionHistoryCostReading;
	readonly rootRequests: SessionHistoryCostReading;
	readonly difference: SessionHistoryCostReading;
}

interface SessionHistoryAttemptCostInput {
	readonly series: SessionHistoryRequestSeries;
	readonly reportedCostUsd: number | undefined;
	readonly rates: ContextRateCatalog | undefined;
}

function calculatedCost(
	series: SessionHistoryRequestSeries,
	rates: ContextRateCatalog | undefined,
): SessionHistoryCostReading {
	if (series.transcriptState === "absent") {
		return { reasons: [TRANSCRIPT_ABSENT], state: "unavailable" };
	}
	if (series.boundary === "unknown") {
		return { reasons: [BOUNDARY_ABSENT], state: "unavailable" };
	}
	if (rates === undefined) {
		return { reasons: [NO_CATALOG], state: "unavailable" };
	}

	const totals = new AttemptRequestCosts(rates);
	for (const entry of series.entries) {
		totals.observe(entry);
	}
	return totals.reading();
}

function sessionHistoryAttemptCost(
	input: Readonly<SessionHistoryAttemptCostInput>,
): SessionHistoryAttemptCost {
	const reported: SessionHistoryCostReading =
		input.reportedCostUsd === undefined
			? {
					reasons: ["the attempt record carries no provider cost"],
					state: "unavailable",
				}
			: { costUsd: input.reportedCostUsd, state: "complete" };
	const rootRequests = calculatedCost(input.series, input.rates);

	return {
		calculated: rootRequests,
		difference: difference(reported, rootRequests),
		reported,
		rootRequests,
	};
}

/**
 * The attempt's cost once its sub-agents are counted: the calculated reading
 * over every agent's attempt requests, each once, and the difference redrawn
 * from it.
 */
function attemptCostOverAgents(
	cost: SessionHistoryAttemptCost,
	calculated: SessionHistoryCostReading,
): SessionHistoryAttemptCost {
	return {
		...cost,
		calculated,
		difference: difference(cost.reported, calculated),
	};
}

function difference(
	reported: SessionHistoryCostReading,
	calculated: SessionHistoryCostReading,
): SessionHistoryCostReading {
	if (reported.state === "unavailable") {
		return {
			reasons: ["the provider reading is unavailable"],
			state: "unavailable",
		};
	}
	if (calculated.state === "unavailable") {
		return {
			reasons: ["the calculated reading is unavailable"],
			state: "unavailable",
		};
	}
	const rounded = Number(
		(reported.costUsd - calculated.costUsd).toFixed(DIFFERENCE_DECIMAL_PLACES),
	);
	const costUsd =
		rounded === ZERO_DIFFERENCE_USD ? ZERO_DIFFERENCE_USD : rounded;
	if (reported.state === "complete" && calculated.state === "complete") {
		return { costUsd, state: "complete" };
	}

	return {
		costUsd,
		pricedRequestCount:
			calculated.state === "incomplete"
				? calculated.pricedRequestCount
				: NO_REQUEST_COUNT_CONTRIBUTION,
		reasons: [
			"a reading it is drawn from is incomplete",
			...(calculated.state === "incomplete" ? calculated.reasons : []),
		],
		requestCount:
			calculated.state === "incomplete"
				? calculated.requestCount
				: NO_REQUEST_COUNT_CONTRIBUTION,
		state: "incomplete",
	};
}

export { sessionHistoryRequestCosts } from "./session-history-request-pricing";

export type { SessionHistoryRequestCost } from "./session-history-request-pricing";

export { attemptCostOverAgents, sessionHistoryAttemptCost };

export type {
	SessionHistoryCostReading,
	SessionHistoryAttemptCost,
	SessionHistoryAttemptCostInput,
};
