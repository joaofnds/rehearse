import type { SessionHistoryReport } from "#benchmark/session-history";
import Switcher from "#client/system/components/switcher";
import SearchInput from "#client/system/ui/search-input";

import type { InvestigationControls } from "./history-investigation-contract";
import SourceList from "./history-source-list";

interface HistorySourceFiltersProps {
	readonly controls: InvestigationControls;
}

function HistorySourceFilters({
	controls,
}: HistorySourceFiltersProps): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 border-b px-3 py-2.5">
			<label className="flex flex-col gap-2 text-12 text-muted-foreground">
				Search sources
				<SearchInput
					value={controls.sourceQuery}
					onChange={(event) => {
						controls.setSourceQuery(event.target.value);
					}}
					placeholder="File, skill, or tool"
				/>
			</label>
			<span className="text-12 text-muted-foreground">
				Size in recorded characters, not request tokens
			</span>
			<Switcher
				label="Sort sources"
				options={["Delivered size", "Most repeated"]}
				selected={controls.sourceSort}
				onSelect={controls.setSourceSort}
			/>
		</div>
	);
}

interface HistorySourceResultsProps {
	readonly report: SessionHistoryReport;
	readonly controls: InvestigationControls;
}

function HistorySourceResults({
	report,
	controls,
}: HistorySourceResultsProps): React.JSX.Element {
	return (
		<div className="max-h-64 overflow-y-auto">
			<SourceList
				total={report.sources.length}
				query={controls.sourceQuery}
				sources={report.sources.filter((source) =>
					`${source.name} ${source.path ?? ""} ${source.kind}`
						.toLocaleLowerCase()
						.includes(controls.sourceQuery.trim().toLocaleLowerCase()),
				)}
				selected={controls.sourceId}
				sort={controls.sourceSort}
				onSelect={(source) => {
					controls.setSourceId(source?.id);
					controls.setSelectedRequestId(undefined);
					controls.setEventQuery("");
					if (controls.view !== "Agents") {
						controls.setView("Evidence");
					}
				}}
			/>
		</div>
	);
}

export { HistorySourceFilters, HistorySourceResults };
