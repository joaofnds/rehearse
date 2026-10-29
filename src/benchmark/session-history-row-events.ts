import type { Immutable } from "./contracts";
import type {
	SessionHistoryReportInput,
	SessionHistoryReportMetadata,
} from "./session-history-contract";
import type {
	MutableEvent,
	ProjectionState,
} from "./session-history-event-contract";
import { parsedRow, parsedRows } from "./session-history-message";
import type { ParsedRow } from "./session-history-message";
import RowEventProjection from "./session-history-row-projection";

const INITIAL_TRANSCRIPT_LINE_NUMBER = 0;

const TRANSCRIPT_BLOCK_NUMBER_BASE = 1;

class HistoryTranscriptProjection {
	private readonly events: MutableEvent[] = [];
	private readonly issues: string[] = [];
	private lineNumber = INITIAL_TRANSCRIPT_LINE_NUMBER;
	private readonly rowInput: Immutable<SessionHistoryReportInput>;
	public constructor(input: Immutable<SessionHistoryReportMetadata>) {
		this.rowInput = { ...input, transcript: "" };
	}
	public observe(text: string): void {
		this.lineNumber += 1;
		const row = parsedRow(text, this.lineNumber);
		if (row !== undefined) {
			const state = parseRowEvents(this.rowInput, row, false);
			this.events.push(...state.events);
			this.issues.push(...state.issues);
		}
	}
	public state(): ProjectionState {
		return { events: this.events, issues: this.issues };
	}
}

function parseRowEvents(
	input: Immutable<SessionHistoryReportInput>,
	row: Immutable<ParsedRow>,
	retainBodies: boolean,
): ProjectionState {
	const projection = new RowEventProjection({ input, retainBodies, row });
	if (row.kind.kind === "attachment") {
		projection.observeAttachment(row.kind.attachmentKind);
	}
	for (const [index, value] of row.blocks.entries()) {
		projection.observe({ block: index + TRANSCRIPT_BLOCK_NUMBER_BASE, value });
	}
	return projection.state();
}

function parseEvents(
	input: Immutable<SessionHistoryReportInput>,
	retainBodies = true,
): ProjectionState {
	if (input.transcript === undefined) {
		return { events: [], issues: [] };
	}
	const states = parsedRows(input.transcript).map((row) =>
		parseRowEvents(input, row, retainBodies),
	);

	return {
		events: states.flatMap(({ events }) => events),
		issues: states.flatMap(({ issues }) => issues),
	};
}

export { parseEvents, parseRowEvents, HistoryTranscriptProjection };
