import { Link } from "@tanstack/react-router";

import recordedInstant from "#benchmark/recorded-instant";
import attemptLabel from "#client/attempt-label";
import plural from "#client/plural";
import withinCase from "#client/within-case";

import type { ContextLink, HistoryRow } from "./history-table-contract";
import {
	EMPTY_COLLECTION_LENGTH,
	FIRST_AVAILABLE_LINK_INDEX,
} from "./history-table-contract";
import recordMoment from "./record-moment";
import { recordIdentity, recordedTime } from "./run-discovery";

function kindLine(row: HistoryRow): string {
	switch (row.kind) {
		case "run": {
			return row.stageGrades.state === "available"
				? `task · ${plural(row.stageGrades.grades.length, "step")}`
				: "task";
		}
		case "session-attempt": {
			return "single session";
		}
		case "replay": {
			return [
				`replay ${row.stage}`,
				row.checkpointShortId === undefined
					? undefined
					: withinCase(row.checkpointShortId, row.caseId),
				row.attempt === undefined ? undefined : attemptLabel(row.attempt),
			]
				.filter((part) => part !== undefined)
				.join(" · ");
		}
		case "group": {
			return `group · ${plural(row.reps, "rep")} · ${row.mode}`;
		}
		default: {
			return row satisfies never;
		}
	}
}

function momentOf(row: HistoryRow, nowMs: number): string {
	const time = recordedTime(row);
	const instant = time === undefined ? undefined : recordedInstant(time);

	return instant === undefined
		? "time not recorded"
		: recordMoment(instant, nowMs);
}

function recordContext(row: HistoryRow): string | undefined {
	if (row.kind !== "replay" && row.kind !== "session-attempt") {
		return undefined;
	}

	return row.links.flatMap((link) =>
		link.state === "available" ? [link.href] : [],
	)[FIRST_AVAILABLE_LINK_INDEX];
}

const RECORD_NAME_CLASS =
	"self-start font-mono text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover";

function recordName(row: HistoryRow, name: string): React.JSX.Element {
	if (row.kind === "run") {
		return (
			<Link
				to="/runs/$run"
				params={{ run: row.run }}
				search={{
					view: row.progress.state === "running" ? "activity" : "results",
				}}
				className={RECORD_NAME_CLASS}
			>
				{name}
			</Link>
		);
	}

	if (row.kind === "group") {
		return (
			<Link
				to="/groups/$groupId"
				params={{ groupId: row.groupId }}
				className={RECORD_NAME_CLASS}
			>
				{name}
			</Link>
		);
	}

	const context = recordContext(row);
	if (context === undefined) {
		return <span className="font-mono text-14">{name}</span>;
	}

	return (
		<a href={context} className={RECORD_NAME_CLASS}>
			{name}
		</a>
	);
}

function runCell(row: HistoryRow, nowMs: number): React.JSX.Element {
	const name =
		row.shortId === undefined
			? recordIdentity(row)
			: withinCase(row.shortId, row.caseId);

	return (
		<span className="flex flex-col gap-0.5">
			{recordName(row, name)}
			<span className="font-mono text-12 text-dim">{momentOf(row, nowMs)}</span>
		</span>
	);
}

const LINK_CLASS =
	"inline-flex min-h-touch-target items-center justify-center rounded-md border border-divider bg-muted px-2 text-14 text-link no-underline hover:border-strong hover:bg-row-hover hover:no-underline";

function contextLink(link: ContextLink): React.JSX.Element {
	switch (link.state) {
		case "available": {
			return (
				<a key={link.label} href={link.href} className={LINK_CLASS}>
					{link.label}
				</a>
			);
		}
		case "unavailable": {
			return (
				<span key={link.label} className="text-12 text-dim">
					{`${link.label} · ${link.reason}`}
				</span>
			);
		}
		default: {
			return link satisfies never;
		}
	}
}

function caseLinks(row: HistoryRow): readonly ContextLink[] {
	if (row.kind === "group") {
		return [];
	}
	return recordContext(row) === undefined
		? row.links
		: row.links.filter((link) => link.state !== "available");
}

function caseCell(row: HistoryRow): React.JSX.Element {
	const links = caseLinks(row);

	return (
		<span className="flex flex-col items-start gap-0.5">
			{row.caseId === undefined ? (
				<span className="text-14 text-dim">case not recorded</span>
			) : (
				<Link
					to="/cases"
					search={{ caseId: row.caseId }}
					className="font-mono text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				>
					{row.caseId}
				</Link>
			)}
			<span className="text-12 text-dim">{kindLine(row)}</span>
			{links.length > EMPTY_COLLECTION_LENGTH ? (
				<span className="mt-2 flex flex-col gap-1.5">
					<span className="text-12 text-muted-foreground">Saved sessions</span>
					<span className="flex flex-wrap gap-2">
						{links.map((link) => contextLink(link))}
					</span>
				</span>
			) : null}
		</span>
	);
}

export { caseCell, runCell };
