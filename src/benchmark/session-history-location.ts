import type { Immutable } from "./contracts";
import type { HistoryRegion } from "./session-history-contract";
import type { MutableEvent } from "./session-history-event-contract";
import type { ParsedRow } from "./session-history-message";
import type { TranscriptLocation } from "./transcript";

function regionFor(
	line: number,
	prefixLinesExcluded: number | undefined,
): HistoryRegion {
	if (prefixLinesExcluded === undefined) {
		return "boundary-unknown";
	}

	return line <= prefixLinesExcluded ? "starting-context" : "attempt";
}

function locatorId(location: Readonly<TranscriptLocation>): string {
	return `${location.line}:${location.block}`;
}

function baseEvent(
	row: Immutable<ParsedRow>,
	block: number,
	region: HistoryRegion,
): Pick<
	MutableEvent,
	"id" | "locator" | "region" | "timestamp" | "relatedEventIds"
> {
	const locator = { block, line: row.line };

	return {
		id: locatorId(locator),
		locator,
		region,
		relatedEventIds: [],
		timestamp: row.timestamp,
	};
}

export { locatorId, regionFor, baseEvent };
