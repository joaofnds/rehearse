import { CORPUS_VERSION_LABEL } from "#benchmark/corpus-version-label";
import withinCase from "#client/within-case";

import type { ListedRow } from "./run-discovery";

function recordIdentity(row: ListedRow): string {
	switch (row.kind) {
		case "run": {
			return row.run;
		}
		case "session-attempt": {
			return row.uuid;
		}
		case "replay": {
			return row.timestamp;
		}
		case "group": {
			return row.groupId;
		}
		default: {
			return row satisfies never;
		}
	}
}

function recordSearchTexts(row: ListedRow): readonly string[] {
	const corpus =
		row.corpusVersion?.kind === "version"
			? [`${CORPUS_VERSION_LABEL}${row.corpusVersion.digest}`]
			: [];
	const blockers =
		row.kind !== "session-attempt" && row.firedBlockers.state === "available"
			? row.firedBlockers.ids
			: [];
	return [
		row.caseId ?? "",
		row.recordId,
		recordIdentity(row),
		row.shortId ?? "",
		row.shortId === undefined ? "" : withinCase(row.shortId, row.caseId),
		...corpus,
		...blockers,
	];
}

function matchesText(texts: readonly string[], search = ""): boolean {
	const needle = search.trim().toLowerCase();
	return texts.some((text) => text.toLowerCase().includes(needle));
}

export { matchesText, recordIdentity, recordSearchTexts };
