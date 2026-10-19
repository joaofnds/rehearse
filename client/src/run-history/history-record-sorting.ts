import recordedInstant from "#benchmark/recorded-instant";

import type { ListedRow, Row, RunDiscoverySearch } from "./run-discovery";

const EMPTY_COLLECTION_LENGTH = 0;

const SORT_DIRECTION_ASCENDING = 1;

const SORT_DIRECTION_DESCENDING = -1;

type SortDirection =
	| typeof SORT_DIRECTION_ASCENDING
	| typeof SORT_DIRECTION_DESCENDING;

const SORT_ORDER_AFTER = 1;

const SORT_ORDER_BEFORE = -1;

const SORT_ORDER_EQUAL = 0;

function recordedTime(row: ListedRow): string | undefined {
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
	return row.cost.state === "available" &&
		row.cost.missing.length === EMPTY_COLLECTION_LENGTH
		? row.cost.usd
		: undefined;
}

function compareMeasured(
	left: number | undefined,
	right: number | undefined,
	direction: SortDirection,
): number {
	if (left === undefined) {
		return right === undefined ? SORT_ORDER_EQUAL : SORT_ORDER_AFTER;
	}
	if (right === undefined) {
		return SORT_ORDER_BEFORE;
	}
	return direction * (left - right);
}

function compareCases(left: ListedRow, right: ListedRow): number {
	if (left.caseId === undefined) {
		return right.caseId === undefined ? SORT_ORDER_EQUAL : SORT_ORDER_AFTER;
	}
	if (right.caseId === undefined) {
		return SORT_ORDER_BEFORE;
	}
	return left.caseId.localeCompare(right.caseId);
}

function sortDiscoveredRows(
	rows: readonly Row[],
	sort: RunDiscoverySearch["sort"],
): readonly Row[] {
	return rows.toSorted((left, right) => {
		if (sort === "cost") {
			const byCost = compareMeasured(
				completeCost(left),
				completeCost(right),
				SORT_DIRECTION_DESCENDING,
			);
			if (byCost !== SORT_ORDER_EQUAL) {
				return byCost;
			}
		}
		if (sort === "case") {
			const byCase = compareCases(left, right);
			if (byCase !== SORT_ORDER_EQUAL) {
				return byCase;
			}
		}
		return compareMeasured(
			rowInstant(left),
			rowInstant(right),
			sort === "oldest" ? SORT_DIRECTION_ASCENDING : SORT_DIRECTION_DESCENDING,
		);
	});
}

export { recordedTime, sortDiscoveredRows };
