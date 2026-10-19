import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { spendReading } from "#client/run-history/run-progress";
import { SessionHistoryPage } from "#client/session-history/session-history-page";

import type { RunDetailSearch } from "./run-detail-search";
import type { PipelineRow } from "./run-record-readings";
import RunSetup from "./run-setup";
import stageCostReading from "./step-readings";
import { wallTimeReading } from "./step-report";

interface SelectedStepResourcesProps {
	readonly selected: MonitoredStage;
}

function SelectedStepResources({
	selected,
}: SelectedStepResourcesProps): React.JSX.Element {
	return (
		<dl
			aria-label="Selected step resources"
			className="mx-5 sm:mx-8 mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-12"
		>
			<div>
				<dt className="text-dim">{selected.stage} · step cost</dt>
				<dd className="mt-1 font-mono">{stageCostReading(selected)}</dd>
			</div>
			<div>
				<dt className="text-dim">Execution</dt>
				<dd className="mt-1 font-mono">
					{selected.sessionCost.state === "available"
						? spendReading(selected.sessionCost.usd)
						: selected.sessionCost.reasons.join("; ")}
				</dd>
			</div>
			<div>
				<dt className="text-dim">Judge</dt>
				<dd className="mt-1 font-mono">
					{selected.judgeCost.state === "available"
						? spendReading(selected.judgeCost.usd)
						: selected.judgeCost.reasons.join("; ")}
				</dd>
			</div>
			<div>
				<dt className="text-dim">Step wall time</dt>
				<dd className="mt-1 font-mono">{wallTimeReading(selected)}</dd>
			</div>
		</dl>
	);
}

interface RunContextProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
	readonly search: RunDetailSearch;
}

function RunContext({
	row,
	record,
	selected,
	search,
}: RunContextProps): React.JSX.Element {
	return (
		<>
			<SelectedStepResources selected={selected} />
			<SessionHistoryPage
				key={`${row.run}:${selected.stage}`}
				identity={{ kind: "stage", run: row.run, stage: selected.stage }}
				embedded
				revealEvents={search.focus === "events"}
				initialEventId={search.event}
			/>
			<details className="mx-5 sm:mx-8 mb-5 rounded-lg border border-border">
				<summary className="cursor-pointer px-4 py-3 text-14">
					Run setup &amp; provenance
				</summary>
				<RunSetup row={row} record={record} selected={selected} />
			</details>
		</>
	);
}

export { RunContext as default };
