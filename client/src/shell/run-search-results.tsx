import recordedInstant from "#benchmark/recorded-instant";
import {
	matchesText,
	recordIdentity,
	recordSearchTexts,
} from "#client/run-history/run-discovery";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { spendReading } from "#client/run-history/run-progress";
import withinCase from "#client/within-case";

import type { SearchResult } from "./search-result-grouping";

const EMPTY_COLLECTION_LENGTH = 0;

const FIRST_AVAILABLE_LINK_INDEX = 0;

type Row = RunListingResponse["rows"][number];

const RECORD_LABELS = {
	group: "Group",
	replay: "Replay",
	run: "Run",
	"session-attempt": "Session attempt",
} as const satisfies Readonly<Record<Row["kind"], string>>;

function runTime(row: Row): string | undefined {
	if (row.kind === "run") {
		return row.run;
	}
	if (row.kind === "replay") {
		return row.timestamp;
	}
	return row.startedAt;
}

function runPreview(row: Row): string {
	const time = runTime(row);
	const instant = time === undefined ? undefined : recordedInstant(time);
	const date =
		instant === undefined
			? "Date not recorded"
			: new Intl.DateTimeFormat(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(instant);
	const outcomeLabel = (): string => {
		switch (row.kind) {
			case "run": {
				return row.finalOutcome.state === "available" &&
					row.finalOutcome.status === "JUDGED"
					? `Final ${row.finalOutcome.verdict}`
					: row.status.toLowerCase().replaceAll("_", " ");
			}
			case "session-attempt": {
				if (row.status === "SUCCESSFUL" || row.status === "UNSUCCESSFUL") {
					return `Reply/transcript checks ${row.status === "SUCCESSFUL" ? "passed" : "failed"}`;
				}
				return row.status.toLowerCase().replaceAll("_", " ");
			}
			case "replay": {
				return `Step ${row.stage} · ${row.status === "CONTINUE" ? "continued" : "stopped"}`;
			}
			case "group": {
				return `${String(row.successful)}/${String(row.reps)} recorded successful · ${row.mode} group`;
			}
			default: {
				return row satisfies never;
			}
		}
	};
	const outcome = outcomeLabel();
	const cost =
		row.cost.state === "available"
			? `${spendReading(row.cost.usd)}${row.cost.missing.length > EMPTY_COLLECTION_LENGTH ? " partial cost" : " reported cost"}`
			: "Cost unavailable";
	return [row.caseId ?? "Case not recorded", date, outcome, cost].join(" · ");
}

function runDestination(row: Row): string | undefined {
	switch (row.kind) {
		case "run": {
			return `/runs/${encodeURIComponent(row.run)}?view=${row.progress.state === "running" ? "activity" : "results"}`;
		}
		case "group": {
			return `/groups/${encodeURIComponent(row.groupId)}`;
		}
		case "session-attempt": {
			return `/attempts/session/${encodeURIComponent(row.caseId)}/${encodeURIComponent(row.uuid)}`;
		}
		case "replay": {
			const href = `/replays/${encodeURIComponent(row.lineage)}/${encodeURIComponent(row.timestamp)}`;
			return row.links.flatMap((link) =>
				link.state === "available" && link.href === href ? [link.href] : [],
			)[FIRST_AVAILABLE_LINK_INDEX];
		}
		default: {
			return row satisfies never;
		}
	}
}

function runSearchResults(
	entries: RunListingResponse["rows"],
	query: string,
): readonly SearchResult[] {
	return entries.flatMap((row) => {
		const href = runDestination(row);
		return href === undefined || !matchesText(recordSearchTexts(row), query)
			? []
			: [
					{
						collection: "Runs" as const,
						detail: runPreview(row),
						href,
						kind: RECORD_LABELS[row.kind],
						label:
							row.shortId === undefined
								? recordIdentity(row)
								: withinCase(row.shortId, row.caseId),
					},
				];
	});
}

export { runSearchResults as default };
