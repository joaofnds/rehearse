import Disclosure from "#client/system/components/disclosure";

import { causeList, disclosureKeyOf } from "./history-corpus-state";
import { reasonsLine } from "./history-step-grades";
import type { HistoryRow, RunningProgress } from "./history-table-contract";
import { EMPTY_COLLECTION_LENGTH } from "./history-table-contract";
import { clockReading, liveElapsedMs, spendReading } from "./run-progress";

function runningCost(progress: RunningProgress): React.JSX.Element {
	const { runSpentUsd, spentUsd, spendScope } = progress;

	return (
		<span className="flex flex-col gap-0.5">
			{figure(spendReading(runSpentUsd ?? spentUsd))}
			{reasonsLine([runSpentUsd === undefined ? spendScope : "so far"])}
		</span>
	);
}

const UNRECORDED = "unrecorded";

function unrecorded(
	row: HistoryRow,
	reasons: readonly string[],
): React.JSX.Element {
	return (
		<span className="flex flex-col items-end gap-0.5">
			<span className="min-h-12 text-12 text-dim">{UNRECORDED}</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				align="end"
				collapsedLabel="why"
				expandedLabel="hide"
			>
				{causeList(reasons)}
			</Disclosure>
		</span>
	);
}

function figure(text: string): React.JSX.Element {
	return <span className="font-mono text-12">{text}</span>;
}

function recordedCost(row: HistoryRow): React.JSX.Element {
	const { cost } = row;
	if (cost.state === "unavailable") {
		return unrecorded(row, cost.reasons);
	}
	if (cost.missing.length === EMPTY_COLLECTION_LENGTH) {
		return figure(spendReading(cost.usd));
	}

	return (
		<span className="flex flex-col items-end gap-0.5">
			<span className="flex min-h-12 flex-col items-end gap-0.5">
				{figure(spendReading(cost.usd))}
				<span className="text-12 text-dim">partial</span>
			</span>
			<Disclosure
				key={disclosureKeyOf(row)}
				align="end"
				collapsedLabel="why"
				expandedLabel="hide"
			>
				{causeList(
					cost.missing.map(({ part, reason }) => `${part}: ${reason}`),
				)}
			</Disclosure>
		</span>
	);
}

function costCell(row: HistoryRow): React.JSX.Element {
	if (row.kind === "run" && row.progress.state === "running") {
		return runningCost(row.progress);
	}

	return recordedCost(row);
}

function wallCell(row: HistoryRow, nowMs: number): React.JSX.Element {
	if (row.kind === "run" && row.progress.state === "running") {
		const { elapsedMs, measuredAt } = row.progress;

		return figure(clockReading(liveElapsedMs(elapsedMs, measuredAt, nowMs)));
	}

	return recordedWall(row);
}

function recordedWall(row: HistoryRow): React.JSX.Element {
	const { wallTime } = row;
	if (wallTime.state === "unavailable") {
		return unrecorded(row, wallTime.reasons);
	}

	return figure(clockReading(wallTime.ms));
}

export { costCell, wallCell };
