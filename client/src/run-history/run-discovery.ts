import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { CORPUS_VERSION_LABEL } from "#benchmark/corpus-version-label";
import { recordedInstant } from "#benchmark/recorded-instant";
import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";
import { withinCase } from "#client/within-case";
import { isClean } from "./clean-record";
import type {
	RunHistoryResponse,
	RunListingResponse,
} from "./run-history-query";

export const runDiscoverySearchSchema = z.object({
	query: z
		.union([z.string(), z.unknown().transform(() => undefined)])
		.optional(),
	status: z
		.union([
			z.enum(["all", "running", "ended", "passed", "failed", "stopped"]),
			z.unknown().transform(() => undefined),
		])
		.optional(),
	kind: z
		.union([
			z.enum(["all", "run", "session-attempt", "replay", "group"]),
			z.unknown().transform(() => undefined),
		])
		.optional(),
	corpus: z
		.union([
			z.enum(["all", "current", "stale"]),
			z.unknown().transform(() => undefined),
		])
		.optional(),
	sort: z
		.union([
			z.enum(["newest", "oldest", "cost", "case"]),
			z.unknown().transform(() => undefined),
		])
		.optional(),
});
export type RunDiscoverySearch = z.output<typeof runDiscoverySearchSchema>;
type Row = RunHistoryResponse["rows"][number];
type ListedRow = RunListingResponse["rows"][number];
type Launch = RunHistoryResponse["launches"][number];

/** The saved start time, never filesystem time or an inferred UUID timestamp. */
export function recordedTime(row: ListedRow): string | undefined {
	switch (row.kind) {
		case "run": {
			return row.run;
		}
		case "replay": {
			return row.timestamp;
		}
		case "session-attempt":
		case "group": {
			return row.startedAt;
		}
		default: {
			return row satisfies never;
		}
	}
}

function rowInstant(row: ListedRow): number | undefined {
	const time = recordedTime(row);
	return time === undefined ? undefined : recordedInstant(time);
}

function completeCost(row: ListedRow): number | undefined {
	return row.cost.state === "available" && row.cost.missing.length === 0
		? row.cost.usd
		: undefined;
}

/** Missing values follow every measured value in either direction. */
function compareMeasured(
	left: number | undefined,
	right: number | undefined,
	direction: 1 | -1,
): number {
	if (left === undefined) {
		return right === undefined ? 0 : 1;
	}
	if (right === undefined) {
		return -1;
	}
	return direction * (left - right);
}

function compareCases(left: ListedRow, right: ListedRow): number {
	if (left.caseId === undefined) {
		return right.caseId === undefined ? 0 : 1;
	}
	if (right.caseId === undefined) {
		return -1;
	}
	return left.caseId.localeCompare(right.caseId);
}

export function sortDiscoveredRows(
	rows: readonly Row[],
	sort: RunDiscoverySearch["sort"],
): readonly Row[] {
	return rows.toSorted((left, right) => {
		if (sort === "cost") {
			const byCost = compareMeasured(
				completeCost(left),
				completeCost(right),
				-1,
			);
			if (byCost !== 0) {
				return byCost;
			}
		}
		if (sort === "case") {
			const byCase = compareCases(left, right);
			if (byCase !== 0) {
				return byCase;
			}
		}
		return compareMeasured(
			rowInstant(left),
			rowInstant(right),
			sort === "oldest" ? 1 : -1,
		);
	});
}

export function recordIdentity(row: ListedRow): string {
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

export function recordSearchTexts(row: ListedRow): readonly string[] {
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

export function matchesText(texts: readonly string[], search = ""): boolean {
	const needle = search.trim().toLowerCase();
	return texts.some((text) => text.toLowerCase().includes(needle));
}

function stoppedBelowMinimum(
	row: Extract<Row, { readonly kind: "run" }>,
): boolean {
	if (
		!isStopped(row.status) ||
		row.minimumGrade.state !== "available" ||
		row.stageGrades.state !== "available"
	) {
		return false;
	}
	const stoppedStage = stoppedStageOf(row.status);
	const stopped = row.stageGrades.grades.find(
		({ stage }) => stage === stoppedStage,
	);
	return stopped?.grade.state === "available" && !stopped.grade.reachesMinimum;
}

function failed(row: Row): boolean {
	switch (row.kind) {
		case "run": {
			return (
				stoppedBelowMinimum(row) ||
				(row.finalOutcome.state === "available" &&
					row.finalOutcome.status === "JUDGED" &&
					row.finalOutcome.verdict === "FAIL")
			);
		}
		case "session-attempt": {
			return row.status === "UNSUCCESSFUL";
		}
		case "replay": {
			return row.status === "STOP";
		}
		case "group": {
			return row.qualityFailures > 0;
		}
		default: {
			return row satisfies never;
		}
	}
}
function passed(row: Row): boolean {
	switch (row.kind) {
		case "run": {
			return (
				row.finalOutcome.state === "available" &&
				row.finalOutcome.status === "JUDGED" &&
				row.finalOutcome.verdict === "PASS"
			);
		}
		case "session-attempt": {
			return row.status === "SUCCESSFUL";
		}
		case "replay": {
			return row.status === "CONTINUE";
		}
		case "group": {
			return (
				row.reps > 0 &&
				row.successful === row.reps &&
				row.unreadReps.length === 0
			);
		}
		default: {
			return row satisfies never;
		}
	}
}

function matchesStatus(
	row: Row,
	status: NonNullable<RunDiscoverySearch["status"]>,
	running: boolean,
): boolean {
	switch (status) {
		case "all": {
			return true;
		}
		case "running": {
			return running;
		}
		case "ended": {
			return !running;
		}
		case "failed": {
			return failed(row);
		}
		case "passed": {
			return passed(row);
		}
		case "stopped": {
			return row.kind === "run" && isStopped(row.status);
		}
		default: {
			return status satisfies never;
		}
	}
}

export function matchesDiscovery(
	row: Row,
	search: RunDiscoverySearch,
): boolean {
	const running =
		row.kind === "run" &&
		(row.progress.state === "running" || row.status === "RUNNING");
	const status = search.status ?? "all";
	const statusMatches = matchesStatus(row, status, running);
	const corpus = search.corpus ?? "all";
	const corpusMatches =
		corpus === "all" ||
		(row.staleness.state === "available" &&
			(corpus === "current" ? isClean(row.staleness) : row.staleness.stale));
	return (
		statusMatches &&
		corpusMatches &&
		(search.kind === undefined ||
			search.kind === "all" ||
			row.kind === search.kind) &&
		matchesText(recordSearchTexts(row), search.query)
	);
}

export function launchMatchesDiscovery(
	launch: Launch,
	search: RunDiscoverySearch,
): boolean {
	const status = search.status ?? "all";
	return (
		(search.kind === undefined || search.kind === "all") &&
		(search.corpus === undefined || search.corpus === "all") &&
		(status === "all" ||
			(status === "running" && launch.status === "RUNNING") ||
			(status === "ended" && launch.status !== "RUNNING")) &&
		matchesText(
			[
				launch.id,
				`launch ${launch.id.slice(0, 8)}`,
				launch.caseId ?? "",
				launch.run ?? "",
				launch.stage ?? "",
			],
			search.query,
		)
	);
}

const RETURN_SEARCH_KEY = ["runs-return-search"] as const;

/** The last Runs selection lives only in the current app's memory. */
export function useRunsReturnSearch(): RunDiscoverySearch {
	const cached = useQuery({
		queryKey: RETURN_SEARCH_KEY,
		queryFn: (): RunDiscoverySearch => ({}),
		initialData: {},
		enabled: false,
	});
	return cached.data;
}

export function useRememberRunsSearch(search: RunDiscoverySearch): void {
	const client = useQueryClient();
	const { query, status, kind, corpus, sort } = search;
	useEffect(() => {
		client.setQueryData<RunDiscoverySearch>(RETURN_SEARCH_KEY, {
			query,
			status,
			kind,
			corpus,
			sort,
		});
	}, [client, query, status, kind, corpus, sort]);
}
