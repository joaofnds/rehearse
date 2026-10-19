import type { Immutable } from "./contracts";
import SESSION_HISTORY_SCHEMA_VERSION from "./session-history-contract";
import type {
	CorpusFileLocation,
	HistoryEventKind,
	HistoryEventState,
	SessionHistoryEvent,
	SessionHistoryReport,
	SessionHistoryReportInput,
	TextMeasurement,
} from "./session-history-contract";
import joinEvents from "./session-history-deliveries";
import type { MutableEvent } from "./session-history-event-contract";
import { measureContent } from "./session-history-measurement";
import { parsedRow } from "./session-history-message";
import { parseEvents, parseRowEvents } from "./session-history-row-events";
import type { SourceSnapshotRange } from "./session-history-snapshots";
import type { TranscriptLocation } from "./transcript";

const NO_TRANSCRIPT_PREFIX_LINES = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const SINGLE_ITEM_COUNT = 1;

const EVENT_DETAIL_BODY_COUNT = 2;

const NO_REMAINING_DETAIL_BYTES = 0;

const MAX_EVENT_DETAIL_BYTES = 65_536;

interface SessionHistoryDetail {
	readonly schemaVersion: typeof SESSION_HISTORY_SCHEMA_VERSION;
	readonly eventId: string;
	readonly locator: TranscriptLocation;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly deliveredText?: string | undefined;
	readonly sourceSnapshot?: string | undefined;
	readonly deliveredMeasurement: TextMeasurement;
	readonly snapshotMeasurement: TextMeasurement;
	readonly sourceSnapshotRange?: SourceSnapshotRange | undefined;
	readonly applicationTruncated: boolean;
	readonly relatedEventIds: readonly string[];
}

function utf8Prefix(text: string, budget: number): string {
	let bytes = 0;
	let prefix = "";
	for (const character of text) {
		const size = Buffer.byteLength(character, "utf8");
		if (bytes + size > budget) {
			break;
		}
		bytes += size;
		prefix += character;
	}

	return prefix;
}

interface AllocatedDetailBodies {
	readonly deliveredText: string | undefined;
	readonly sourceSnapshot: string | undefined;
	readonly truncated: boolean;
}

function allocateDetailBodies(
	delivered: string | undefined,
	snapshot: string | undefined,
): AllocatedDetailBodies {
	const bodies = [delivered, snapshot].filter(
		(value): value is string => value !== undefined,
	);
	if (bodies.length === EMPTY_COLLECTION_LENGTH) {
		return {
			deliveredText: undefined,
			sourceSnapshot: undefined,
			truncated: false,
		};
	}
	if (bodies.length === SINGLE_ITEM_COUNT) {
		const [body = ""] = bodies;
		const excerpt = utf8Prefix(body, MAX_EVENT_DETAIL_BYTES);

		return {
			deliveredText: delivered === undefined ? undefined : excerpt,
			sourceSnapshot: snapshot === undefined ? undefined : excerpt,
			truncated: excerpt !== body,
		};
	}

	return allocateBothBodies(delivered, snapshot);
}

function sessionHistoryDetail(
	input: Immutable<SessionHistoryReportInput>,
	eventId: string,
): SessionHistoryDetail | undefined {
	if (input.transcript === undefined) {
		return undefined;
	}
	const projection = joinEvents(parseEvents(input));
	const event = projection.events.find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}
	const excerpts = allocateDetailBodies(event.content, event.snapshot);

	return {
		applicationTruncated: excerpts.truncated,
		deliveredMeasurement: event.measurement,
		deliveredText: excerpts.deliveredText,
		eventId: event.id,
		kind: event.kind,
		locator: event.locator,
		relatedEventIds: event.relatedEventIds,
		schemaVersion: SESSION_HISTORY_SCHEMA_VERSION,
		snapshotMeasurement:
			event.snapshotMeasurement ?? measureContent(event.snapshot).measurement,
		sourceSnapshot: excerpts.sourceSnapshot,
		sourceSnapshotRange: event.snapshotRange,
		state: event.state,
	};
}

interface SessionHistoryLine {
	readonly eventId: string;
	readonly lineText: string;
}

function sessionHistoryDetailFromLine(
	report: Immutable<SessionHistoryReport>,
	resolvedCorpusFiles: readonly CorpusFileLocation[],
	{ eventId, lineText }: SessionHistoryLine,
): SessionHistoryDetail | undefined {
	const event = [
		...report.startingContext,
		...report.attemptEvents,
		...report.boundaryUnknown,
	].find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}
	const raw = rawEventForLine({ event, lineText, report, resolvedCorpusFiles });
	if (raw === undefined) {
		return undefined;
	}
	const excerpts = allocateDetailBodies(raw.content, raw.snapshot);

	return {
		applicationTruncated: excerpts.truncated,
		deliveredMeasurement: raw.measurement,
		deliveredText: excerpts.deliveredText,
		eventId: event.id,
		kind: event.kind,
		locator: event.locator,
		relatedEventIds: event.relatedEventIds,
		schemaVersion: SESSION_HISTORY_SCHEMA_VERSION,
		snapshotMeasurement:
			raw.snapshotMeasurement ?? measureContent(raw.snapshot).measurement,
		sourceSnapshot: excerpts.sourceSnapshot,
		sourceSnapshotRange: raw.snapshotRange,
		state: event.state,
	};
}

function allocateBothBodies(
	delivered: string | undefined,
	snapshot: string | undefined,
): AllocatedDetailBodies {
	const half = Math.floor(MAX_EVENT_DETAIL_BYTES / EVENT_DETAIL_BODY_COUNT);
	let deliveredText = utf8Prefix(delivered ?? "", half);
	let sourceSnapshot = utf8Prefix(snapshot ?? "", half);
	const remaining =
		MAX_EVENT_DETAIL_BYTES -
		Buffer.byteLength(deliveredText, "utf8") -
		Buffer.byteLength(sourceSnapshot, "utf8");
	if (remaining > NO_REMAINING_DETAIL_BYTES && deliveredText === delivered) {
		sourceSnapshot = utf8Prefix(snapshot ?? "", half + remaining);
	} else if (
		remaining > NO_REMAINING_DETAIL_BYTES &&
		sourceSnapshot === snapshot
	) {
		deliveredText = utf8Prefix(delivered ?? "", half + remaining);
	}

	return {
		deliveredText,
		sourceSnapshot,
		truncated: deliveredText !== delivered || sourceSnapshot !== snapshot,
	};
}

interface RawHistoryLine {
	readonly report: Immutable<SessionHistoryReport>;
	readonly event: Immutable<SessionHistoryEvent>;
	readonly resolvedCorpusFiles: readonly CorpusFileLocation[];
	readonly lineText: string;
}

function rawEventForLine({
	report,
	event,
	resolvedCorpusFiles,
	lineText,
}: RawHistoryLine): MutableEvent | undefined {
	const row = parsedRow(lineText, event.locator.line);
	if (row === undefined) {
		return undefined;
	}
	const prefixLinesExcluded = detailLineBoundary(event);
	const raw = parseRowEvents(
		{
			attempt: report.attempt,
			diagnostics: report.diagnostics,
			prefixLinesExcluded,
			resolvedCorpusFiles,
			transcript: "",
		},
		row,
		true,
	).events.find(({ id }) => id === event.id);
	return raw;
}

function detailLineBoundary(
	event: Immutable<SessionHistoryEvent>,
): number | undefined {
	if (event.region === "starting-context") {
		return event.locator.line;
	}
	if (event.region === "attempt") {
		return NO_TRANSCRIPT_PREFIX_LINES;
	}
	return undefined;
}

export {
	MAX_EVENT_DETAIL_BYTES,
	sessionHistoryDetail,
	sessionHistoryDetailFromLine,
};

export type { SessionHistoryDetail };
