import { ResourceReadings } from "./resource-readings";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import { minutesAndSeconds } from "#client/monitor/minutes-and-seconds";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { spendReading } from "#client/run-history/run-progress";
import { wallTimeReading } from "./step-report";
import { stageCostReading } from "./step-readings";

function startingCheckpoint(stage: MonitoredStage): string {
	const input = stage.artifactsIn.entries.find(
		(entry) => entry.from === "upstream checkpoint",
	);
	if (input?.from !== "upstream checkpoint") {
		return "No starting checkpoint recorded";
	}
	if (input.checkpointShortId.state === "available") {
		return input.checkpointShortId.shortId;
	}
	if (input.upstream === "initial") {
		return "Initial checkpoint";
	}
	return `${input.upstream} checkpoint`;
}

export function RunSetup({
	row,
	record,
	selected,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: MonitoredStage;
}): React.JSX.Element {
	const input = startingCheckpoint(selected);
	const entries = [
		["Case", record.caseId],
		["Run", row.shortId ?? row.run],
		[
			"Model / effort",
			[record.identity.model, record.identity.effort]
				.filter(Boolean)
				.join(" / "),
		],
		["Target", `${record.identity.target} @ ${record.identity.commit}`],
		["Step corpus", corpusMeasurementReading(selected.corpusVersion)],
		["Run corpus", corpusMeasurementReading(row.corpusVersion)],
		["Frozen input", input],
		[
			"Minimum grade",
			record.minimumGrade.state === "available"
				? record.minimumGrade.letter
				: record.minimumGrade.reasons.join("; "),
		],
		["Step cost", stageCostReading(selected)],
		["Step wall time", wallTimeReading(selected)],
		[
			"Run cost",
			record.totals.cost.state === "available"
				? `${spendReading(record.totals.cost.usd)}${record.totals.cost.missing.length === 0 ? "" : " · partial"}`
				: record.totals.cost.reasons.join("; "),
		],
		[
			"Run wall time",
			record.totals.wallTime.state === "available"
				? minutesAndSeconds(record.totals.wallTime.ms)
				: record.totals.wallTime.reasons.join("; "),
		],
	] as const;

	return (
		<section aria-label="Run setup & provenance" className="px-6 py-4">
			<dl className="grid gap-x-6 gap-y-3 md:grid-cols-3 xl:grid-cols-4">
				{entries.map(([term, value]) => (
					<div key={term} className="min-w-0">
						<dt className="text-10 tracking-label text-dim uppercase">
							{term}
						</dt>
						<dd className="mt-1 font-mono text-11-5 wrap-anywhere text-secondary-foreground">
							{value}
						</dd>
					</div>
				))}
			</dl>
			<ResourceReadings record={record} stage={selected} />
		</section>
	);
}
