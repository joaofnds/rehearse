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
	DecodedTranscriptRow,
	ParsedCompactionRow,
	ParsedRequestRow,
} from "./session-history-request-row";

const INITIAL_TRANSCRIPT_LINE_NUMBER = 0;

class RequestTranscriptRows {
	private readonly rows: ParsedRequestRow[] = [];
	private readonly compactions: ParsedCompactionRow[] = [];
	private readonly unreadableLines: number[] = [];
	private lineNumber = INITIAL_TRANSCRIPT_LINE_NUMBER;
	public observe(text: string): void {
		this.lineNumber += 1;
		const decoded = transcriptRow(text);
		if (decoded.kind === "unreadable") {
			this.unreadableLines.push(this.lineNumber);
		}
		if (decoded.kind === "row") {
			this.observeRow(decoded.row);
		}
	}
	private observeRow(row: DecodedTranscriptRow): void {
		const request = parsedRequestRow(row, this.lineNumber);
		if (request !== undefined) {
			this.rows.push(request);
		}
		const compaction = parsedCompactionRow(row, this.lineNumber);
		if (compaction !== undefined) {
			this.compactions.push(compaction);
		}
	}
	public series(boundary: RequestSeriesBoundary): SessionHistoryRequestSeries {
		return seriesFromRows(
			{
				compactionRows: this.compactions,
				rows: this.rows,
				unreadableLines: this.unreadableLines,
			},
			boundary,
		);
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

interface ReadTranscriptRows {
	readonly rows: readonly Readonly<ParsedRequestRow>[];
	readonly compactionRows: readonly Readonly<ParsedCompactionRow>[];
	readonly unreadableLines: readonly number[];
}

function seriesFromRows(
	{ rows, compactionRows, unreadableLines }: ReadTranscriptRows,
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
		unreadableLines: unreadableLines.map((line) => ({
			line,
			region: regionFor(line, prefixLinesExcluded),
		})),
	};
}

export { default as attemptTotals } from "./session-history-attempt-usage";

export { sessionHistoryRequestSeries, sessionHistoryRequestSeriesFromLines };
