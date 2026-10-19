import attemptTotals from "./session-history-attempt-usage";
import { regionFor } from "./session-history-location";
import collapsedEntries from "./session-history-request-collapse";
import { TOTAL_INPUT_TOKENS_OMITS } from "./session-history-request-contract";
import type {
	RequestSeriesBoundary,
	SessionHistoryRequestSeries,
	SessionHistoryRequestSeriesInput,
	SessionHistoryRequestSeriesMetadata,
} from "./session-history-request-contract";
import {
	parsedCompactionRow,
	parsedRequestRow,
	transcriptRow,
} from "./session-history-request-row";
import type {
	ParsedCompactionRow,
	ParsedRequestRow,
} from "./session-history-request-row";

const INITIAL_TRANSCRIPT_LINE_NUMBER = 0;

class RequestTranscriptRows {
	private readonly rows: ParsedRequestRow[] = [];
	private readonly compactions: ParsedCompactionRow[] = [];
	private lineNumber = INITIAL_TRANSCRIPT_LINE_NUMBER;
	public observe(text: string): void {
		this.lineNumber += 1;
		const { request, compaction } = lineReadings(text, this.lineNumber);
		if (request !== undefined) {
			this.rows.push(request);
		}
		if (compaction !== undefined) {
			this.compactions.push(compaction);
		}
	}
	public series(boundary: RequestSeriesBoundary): SessionHistoryRequestSeries {
		return seriesFromRows(this.rows, this.compactions, boundary);
	}
}

function sessionHistoryRequestSeries(
	input: Readonly<SessionHistoryRequestSeriesInput>,
): SessionHistoryRequestSeries {
	const transcript = new RequestTranscriptRows();
	for (const text of (input.transcript ?? "").split("\n")) {
		transcript.observe(text);
	}
	return transcript.series({
		prefixLinesExcluded: input.prefixLinesExcluded,
		transcriptState: input.transcript === undefined ? "absent" : "saved",
	});
}

async function sessionHistoryRequestSeriesFromLines(
	input: Readonly<SessionHistoryRequestSeriesMetadata>,
	lines: AsyncIterable<string>,
): Promise<SessionHistoryRequestSeries> {
	const transcript = new RequestTranscriptRows();
	for await (const text of lines) {
		transcript.observe(text);
	}
	return transcript.series({
		prefixLinesExcluded: input.prefixLinesExcluded,
		transcriptState: "saved",
	});
}

interface TranscriptLineReadings {
	readonly request: ParsedRequestRow | undefined;
	readonly compaction: ParsedCompactionRow | undefined;
}

function lineReadings(text: string, line: number): TranscriptLineReadings {
	const decoded = transcriptRow(text);
	if (decoded === undefined) {
		return { compaction: undefined, request: undefined };
	}

	return {
		compaction: parsedCompactionRow(decoded, line),
		request: parsedRequestRow(decoded, line),
	};
}

function seriesFromRows(
	rows: readonly Readonly<ParsedRequestRow>[],
	compactionRows: readonly Readonly<ParsedCompactionRow>[],
	{ prefixLinesExcluded, transcriptState }: RequestSeriesBoundary,
): SessionHistoryRequestSeries {
	const boundary = prefixLinesExcluded === undefined ? "unknown" : "known";
	const entries = collapsedEntries(rows, prefixLinesExcluded);

	return {
		attemptTotals: attemptTotals(entries, boundary, transcriptState),
		boundary,
		compactions: compactionRows.map((compaction) => ({
			line: compaction.line,
			region: regionFor(compaction.line, prefixLinesExcluded),
			trigger: compaction.trigger,
		})),
		entries,
		measuresActiveContextWindow: false,
		name: "total input tokens",
		omits: TOTAL_INPUT_TOKENS_OMITS,
		transcriptState,
	};
}

export { default as attemptTotals } from "./session-history-attempt-usage";

export { sessionHistoryRequestSeries, sessionHistoryRequestSeriesFromLines };
