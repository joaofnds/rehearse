import { sameUsage } from "./session-history-request-row";
import type { ParsedRequestRow } from "./session-history-request-row";

class RequestRowGroups {
	private readonly firstRowByRequestId = new Map<
		string,
		Readonly<ParsedRequestRow>
	>();
	private readonly byFirstRow = new Map<
		Readonly<ParsedRequestRow>,
		RequestRows
	>();
	public observe(row: Readonly<ParsedRequestRow>): void {
		const first =
			row.requestId === undefined
				? undefined
				: this.firstRowByRequestId.get(row.requestId);
		const seen = first === undefined ? undefined : this.byFirstRow.get(first);
		if (seen === undefined) {
			if (row.requestId !== undefined) {
				this.firstRowByRequestId.set(row.requestId, row);
			}
			this.byFirstRow.set(row, openedRequest(row));
		} else {
			this.byFirstRow.set(seen.first, withRow(seen, row));
		}
	}
	public records(): ReadonlyMap<Readonly<ParsedRequestRow>, RequestRows> {
		return this.byFirstRow;
	}
}

/**
 * What the rows sharing one requestId say about that request. The provider
 * writes a row per streamed content block, and only a row carrying a stop
 * reason holds the request's final usage, so the earlier rows' climbing counts
 * are partial readings rather than disagreements. A row that carries no
 * stop_reason field at all says nothing about being partial and counts as
 * final, which keeps every transcript that never wrote the field reading as it
 * did.
 */
interface RequestRows {
	readonly first: Readonly<ParsedRequestRow>;
	readonly finalRow: Readonly<ParsedRequestRow> | undefined;
	readonly last: Readonly<ParsedRequestRow>;
	readonly usageConflict: boolean;
	readonly modelConflict: boolean;
}

function requestRows(
	rows: readonly Readonly<ParsedRequestRow>[],
): ReadonlyMap<Readonly<ParsedRequestRow>, RequestRows> {
	const grouped = new RequestRowGroups();
	for (const row of rows) {
		grouped.observe(row);
	}
	return grouped.records();
}

function openedRequest(row: Readonly<ParsedRequestRow>): RequestRows {
	return {
		finalRow: row.final ? row : undefined,
		first: row,
		last: row,
		modelConflict: false,
		usageConflict: false,
	};
}

function withRow(
	request: Readonly<RequestRows>,
	row: Readonly<ParsedRequestRow>,
): RequestRows {
	const finalRow = request.finalRow ?? (row.final ? row : undefined);
	const disagrees =
		row.final &&
		finalRow !== undefined &&
		!sameUsage(finalRow.usage, row.usage);

	return {
		finalRow,
		first: request.first,
		last: row,
		modelConflict: request.modelConflict || request.first.model !== row.model,
		usageConflict: request.usageConflict || disagrees,
	};
}

export { requestRows as default };

export type { RequestRows };
