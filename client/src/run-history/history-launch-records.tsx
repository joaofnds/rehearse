import recordedInstant from "#benchmark/recorded-instant";
import Disclosure from "#client/system/components/disclosure";
import { Status } from "#client/system/components/status";
import SummaryPanel from "#client/system/components/summary-panel";
import TableShell from "#client/system/components/table-shell";

import type { LaunchRow } from "./history-table-contract";
import {
	EMPTY_COLLECTION_LENGTH,
	LAUNCH_ID_PREVIEW_CHARACTERS,
	PREFIX_START_INDEX,
	SINGLE_ITEM_COUNT,
	SORT_ORDER_AFTER,
	SORT_ORDER_BEFORE,
	SORT_ORDER_EQUAL,
} from "./history-table-contract";
import recordMoment from "./record-moment";
import { RunControls } from "./run-controls";
import { runStatusState } from "./run-status";

function launchAttemptsLine(launch: LaunchRow): string {
	if (launch.target === "analysis") {
		return "one call";
	}

	return launch.attempts === SINGLE_ITEM_COUNT
		? "one run"
		: `group · ${String(launch.attempts)} attempts`;
}

function launchTarget(launch: LaunchRow): string {
	const checkpoint = `${launch.stage ?? ""} · ${launch.run ?? ""}`;
	switch (launch.target) {
		case "case": {
			return launch.caseId ?? "";
		}
		case "replay": {
			return `replay ${checkpoint}`;
		}
		case "comparison": {
			return `compare attempts at ${checkpoint}`;
		}
		case "extension": {
			return `add attempts to a comparison at ${checkpoint}`;
		}
		case "analysis": {
			return `root-cause analysis of ${launch.run ?? ""}`;
		}
		default: {
			return launch.target satisfies never;
		}
	}
}

function launchOutcome(launch: LaunchRow): React.JSX.Element {
	switch (launch.status) {
		case "RUNNING": {
			return (
				<>
					<Status state={runStatusState(launch.status)} />
					<span className="text-12 text-dim">started from the browser</span>
					{/* An analysis is one capped call the server refuses to stop. */}
					{launch.target === "analysis" ? undefined : (
						<RunControls key={launch.id} launchId={launch.id} run={undefined} />
					)}
				</>
			);
		}
		case "ENDED": {
			return (
				<>
					<Status state={runStatusState(launch.status)} label="ended" />
					<span className="text-12 text-dim whitespace-pre-line wrap-anywhere">
						{launch.ending.message}
					</span>
				</>
			);
		}
		case "OPERATOR_STOPPED": {
			return (
				<>
					<Status state={runStatusState(launch.status)} />
					<span className="text-12 text-dim">stopped by the operator</span>
				</>
			);
		}
		default: {
			return launch satisfies never;
		}
	}
}

function launchCells(
	launch: LaunchRow,
	nowMs: number,
): readonly React.JSX.Element[] {
	const target = launchTarget(launch);
	const instant = recordedInstant(launch.launchedAt);

	return [
		<span key="run" className="font-mono text-14">
			{`launch ${launch.id.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`}
		</span>,
		<span key="case" className="flex flex-col items-start gap-0.5">
			<span className="font-mono text-14">{target}</span>
			<span className="text-12 text-dim">{launchAttemptsLine(launch)}</span>
		</span>,
		<span key="outcome" className="flex flex-col gap-0.5">
			{launchOutcome(launch)}
		</span>,
		<span key="started" className="text-12 text-muted-foreground">
			{instant === undefined ? (
				"Time not recorded"
			) : (
				<time dateTime={launch.launchedAt} title={launch.launchedAt}>
					{recordMoment(instant, nowMs)}
				</time>
			)}
		</span>,
	];
}

function endedLaunchesLabel(launches: readonly LaunchRow[]): string {
	const withAReason = launches.filter(
		({ status }) => status === "ENDED",
	).length;
	const count = String(launches.length);

	return withAReason === EMPTY_COLLECTION_LENGTH
		? `Ended launch history (${count})`
		: `Ended launch history (${count}, ${String(withAReason)} with a reason)`;
}

function newestLaunches(launches: readonly LaunchRow[]): readonly LaunchRow[] {
	return launches.toSorted((left, right) => {
		const leftTime = recordedInstant(left.launchedAt);
		const rightTime = recordedInstant(right.launchedAt);
		if (leftTime === undefined) {
			return rightTime === undefined ? SORT_ORDER_EQUAL : SORT_ORDER_AFTER;
		}
		if (rightTime === undefined) {
			return SORT_ORDER_BEFORE;
		}
		return rightTime - leftTime;
	});
}

interface LaunchQueueProps {
	readonly launches: readonly LaunchRow[];
	readonly nowMs: number;
}

function LaunchQueue({
	launches,
	nowMs,
}: LaunchQueueProps): React.JSX.Element | null {
	if (launches.length === EMPTY_COLLECTION_LENGTH) {
		return null;
	}
	return (
		<SummaryPanel
			title="Active launches"
			description="Browser processes still in flight. Execution state is separate from recorded quality outcomes."
		>
			<div className="overflow-x-auto">
				<TableShell
					caption="Active launch queue"
					columns={["Launch", "Target", "Execution", "Started"]}
					rows={newestLaunches(launches).map((launch) =>
						launchCells(launch, nowMs),
					)}
				/>
			</div>
		</SummaryPanel>
	);
}

interface EndedLaunchesProps {
	readonly launches: readonly LaunchRow[];
	readonly nowMs: number;
}

function EndedLaunches({
	launches,
	nowMs,
}: EndedLaunchesProps): React.JSX.Element | null {
	if (launches.length === EMPTY_COLLECTION_LENGTH) {
		return null;
	}
	return (
		<div className="rounded-lg border border-divider bg-card p-4">
			<Disclosure
				collapsedLabel={endedLaunchesLabel(launches)}
				expandedLabel="Hide ended launch history"
			>
				<p className="my-2 text-14 text-muted-foreground">
					These launch records have ended. They carry no recorded quality
					outcome.
				</p>
				<div className="w-full overflow-x-auto">
					<TableShell
						caption="Ended launches"
						columns={["Launch", "Target", "Execution", "Started"]}
						rows={newestLaunches(launches).map((launch) =>
							launchCells(launch, nowMs),
						)}
					/>
				</div>
			</Disclosure>
		</div>
	);
}

export { EndedLaunches, LaunchQueue };
