import type { Immutable } from "./contracts";
import type {
	SessionHistoryCostReading,
	SessionHistoryRequestCost,
} from "./session-history";

const NO_SPEND_USD = 0;

const NO_PRICED_REQUESTS = 0;

const NO_RECORDED_REQUESTS = 0;

const PRICED_REQUEST_COUNT_INCREMENT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * A running count behind a reading, kept until the reading is formed so that a
 * sum of readings counts the requests of its complete parts too.
 */
interface Tally {
	readonly costUsd: number;
	readonly priced: number;
	readonly requests: number;
	readonly reasons: readonly string[];
}

function tally(
	lines: readonly number[],
	costs: ReadonlyMap<number, SessionHistoryRequestCost>,
): Tally {
	let costUsd = 0;
	let priced = 0;
	const reasons = new Set<string>();

	for (const line of lines) {
		const cost = costs.get(line);
		if (cost?.state === "priced") {
			costUsd += cost.costUsd;
			priced += PRICED_REQUEST_COUNT_INCREMENT;
		} else if (cost !== undefined) {
			reasons.add(cost.reason);
		}
	}

	return { costUsd, priced, reasons: [...reasons], requests: lines.length };
}

/**
 * A sum of tallies. A part with no tally at all, such as an agent whose
 * transcript was not kept, adds its reason and no cost.
 */
function summed(
	parts: Immutable<readonly Tally[]>,
	missing: readonly string[],
): Tally {
	return {
		costUsd: parts.reduce((sum, { costUsd }) => sum + costUsd, NO_SPEND_USD),
		priced: parts.reduce((sum, { priced }) => sum + priced, NO_PRICED_REQUESTS),
		reasons: [
			...new Set([...missing, ...parts.flatMap(({ reasons }) => reasons)]),
		],
		requests: parts.reduce(
			(sum, { requests }) => sum + requests,
			NO_RECORDED_REQUESTS,
		),
	};
}

function readingOf(counted: Immutable<Tally>): SessionHistoryCostReading {
	if (counted.reasons.length === EMPTY_COLLECTION_LENGTH) {
		return { costUsd: counted.costUsd, state: "complete" };
	}

	return {
		costUsd: counted.costUsd,
		pricedRequestCount: counted.priced,
		reasons: counted.reasons,
		requestCount: counted.requests,
		state: "incomplete",
	};
}

function reading(
	lines: readonly number[],
	costs: ReadonlyMap<number, SessionHistoryRequestCost>,
): SessionHistoryCostReading {
	return readingOf(tally(lines, costs));
}

function unavailableAgentReason(agentId: string): string {
	return `no transcript was kept for sub-agent ${agentId}`;
}
export { tally, summed, readingOf, reading, unavailableAgentReason };
export type { Tally };
