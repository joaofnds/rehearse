import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { EditVersions } from "./invalidated-by";
import { editNamedBy } from "./invalidated-by";
import type { RunHistoryResponse } from "./run-history-query";

type HistoryRow = RunHistoryResponse["rows"][number];

/** A read the selection waits on, as the screen holds it now. */
export type Read<Body> =
	| { readonly state: "loading" }
	| { readonly state: "failed" }
	| { readonly state: "loaded"; readonly body: Body };

/** An invalidated result run history has no row for. */
export interface MissingRow {
	readonly id: string;
	/** Why its record could not be read, when run history says. */
	readonly reason: string | undefined;
}

/**
 * What run history lists for an address naming an edit. Every state but
 * `listed` lists no row as invalidated, since the screen cannot tell which
 * rows the named edit invalidated.
 */
export type InvalidatedSelection =
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
export function invalidatedSelection(
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
	if (corpus.state === "loading") {
		return { kind: "unanswered", reason: "Reading the last edit…" };
	}
	if (corpus.state === "failed") {
		return {
			kind: "unanswered",
			reason:
				"Could not load the corpus report, so no result is listed as invalidated.",
		};
	}

	const { lastEdit } = corpus.body;
	if (lastEdit.kind === "not-recorded") {
		return {
			kind: "unanswered",
			reason: `The last edit is not recorded, so no result is listed as invalidated: ${lastEdit.reason}`,
		};
	}
	if (!sameEdit(named, lastEdit)) {
		return { kind: "moved-on", last: lastEdit };
	}
	if (runs.state === "loading") {
		return { kind: "unanswered", reason: "Reading run history…" };
	}
	if (runs.state === "failed") {
		return {
			kind: "unanswered",
			reason:
				"Could not load run history, so no result is listed as invalidated.",
		};
	}

	const invalidated = new Set(lastEdit.rows);
	const listed = new Set(runs.body.rows.map(({ recordId }) => recordId));

	return {
		kind: "listed",
		edit: lastEdit,
		count: lastEdit.count,
		rows: runs.body.rows.filter(({ recordId }) => invalidated.has(recordId)),
		missing: lastEdit.rows
			.filter((id) => !listed.has(id))
			.map((id) => ({
				id,
				reason: runs.body.unreadable.find((record) => record.id === id)?.reason,
			})),
	};
}
