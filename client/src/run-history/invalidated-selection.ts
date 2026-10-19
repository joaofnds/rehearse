import type { CorpusResponse } from "#client/corpus/corpus-query";

import type { EditVersions } from "./invalidated-by";
import { editNamedBy } from "./invalidated-by";
import type { RunHistoryResponse } from "./run-history-query";

type HistoryRow = RunHistoryResponse["rows"][number];

/** A read the selection waits on, as the screen holds it now. */
type Read<Body> =
	| { readonly state: "loading" }
	| { readonly state: "failed" }
	| { readonly state: "loaded"; readonly body: Body };

/** An invalidated result run history has no row for. */
interface MissingRow {
	readonly id: string;
	/** Why its record could not be read, when run history says. */
	readonly reason: string | undefined;
}

/**
 * What run history lists for an address naming an edit. Every state but
 * `listed` lists no row as invalidated, since the screen cannot tell which
 * rows the named edit invalidated.
 */
type InvalidatedSelection =
	| { readonly kind: "unanswered"; readonly reason: string }
	| {
			readonly kind: "moved-on";
			readonly last: EditVersions;
	  }
	| {
			readonly kind: "listed";
			readonly edit: EditVersions;
			readonly count: number;
			readonly rows: readonly HistoryRow[];
			readonly missing: readonly MissingRow[];
	  };

function sameEdit(named: EditVersions, last: EditVersions): boolean {
	return named.previous === last.previous && named.current === last.current;
}

/**
 * The rows the last edit invalidated, read from the corpus report and the
 * run history the screen already holds, when the address names that edit.
 */
function invalidatedSelection(
	value: string,
	corpus: Read<CorpusResponse>,
	runs: Read<RunHistoryResponse>,
): InvalidatedSelection {
	const named = editNamedBy(value);
	if (named === undefined) {
		return {
			kind: "unanswered",
			reason:
				"The address names no edit, so no result is listed as invalidated by it.",
		};
	}
	switch (corpus.state) {
		case "loading": {
			return { kind: "unanswered", reason: "Reading the last edit…" };
		}
		case "failed": {
			return {
				kind: "unanswered",
				reason:
					"Could not load the corpus report, so no result is listed as invalidated.",
			};
		}
		case "loaded": {
			return selectionForEdit({ lastEdit: corpus.body.lastEdit, named, runs });
		}
		default: {
			return corpus satisfies never;
		}
	}
}

interface EditSelectionRequest {
	readonly named: EditVersions;
	readonly lastEdit: CorpusResponse["lastEdit"];
	readonly runs: Read<RunHistoryResponse>;
}

function selectionForEdit({
	named,
	lastEdit,
	runs,
}: EditSelectionRequest): InvalidatedSelection {
	if (lastEdit.kind === "not-recorded") {
		return {
			kind: "unanswered",
			reason: `The last edit is not recorded, so no result is listed as invalidated: ${lastEdit.reason}`,
		};
	}
	if (!sameEdit(named, lastEdit)) {
		return { kind: "moved-on", last: lastEdit };
	}
	switch (runs.state) {
		case "loading": {
			return { kind: "unanswered", reason: "Reading run history…" };
		}
		case "failed": {
			return {
				kind: "unanswered",
				reason:
					"Could not load run history, so no result is listed as invalidated.",
			};
		}
		case "loaded": {
			return listedSelection({ lastEdit, runs: runs.body });
		}
		default: {
			return runs satisfies never;
		}
	}
}

interface ListedSelectionRequest {
	readonly lastEdit: Extract<
		CorpusResponse["lastEdit"],
		{ readonly kind: "measured" }
	>;
	readonly runs: RunHistoryResponse;
}

function listedSelection({
	lastEdit,
	runs,
}: ListedSelectionRequest): InvalidatedSelection {
	const invalidated = new Set(lastEdit.rows);
	const listed = new Set(runs.rows.map(({ recordId }) => recordId));

	return {
		count: lastEdit.count,
		edit: lastEdit,
		kind: "listed",
		missing: lastEdit.rows
			.filter((id) => !listed.has(id))
			.map((id) => ({
				id,
				reason: runs.unreadable.find((record) => record.id === id)?.reason,
			})),
		rows: runs.rows.filter(({ recordId }) => invalidated.has(recordId)),
	};
}

export { invalidatedSelection as default };
export type { InvalidatedSelection, MissingRow, Read };
