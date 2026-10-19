import { Link } from "@tanstack/react-router";

import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { useRunsReturnSearch } from "#client/run-history/run-discovery";
import { runStatusState } from "#client/run-history/run-status";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";

import type { PipelineRow } from "./run-record-readings";
import { executionReading, metaLine } from "./run-record-readings";

interface RunIdentityReadingsProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly humanState: string;
}

function RunIdentityReadings({
	row,
	record,
	humanState,
}: RunIdentityReadingsProps): React.JSX.Element {
	return (
		<span className="flex min-w-0 flex-col gap-2">
			<Link
				to="/cases"
				search={{ caseId: record.caseId }}
				className="w-fit max-w-full text-14 text-link underline wrap-anywhere hover:text-link-hover"
			>
				{record.caseId}
			</Link>
			<span className="flex min-w-0 items-baseline gap-2">
				<span aria-hidden="true">
					{STATUS_VOCABULARY[runStatusState(row.status)].glyph}
				</span>
				<span>{executionReading(row, record)}</span>
			</span>
			{row.progress.state === "running" ? null : (
				<span>
					Final result:{" "}
					{record.finalOutcome.status === "JUDGED"
						? record.finalOutcome.verdict
						: "unavailable"}
					{" · "}Human review: {humanState}
				</span>
			)}
			<span className="font-mono">{metaLine(row)}</span>
		</span>
	);
}

function RunReturnLink(): React.JSX.Element {
	const returnSearch = useRunsReturnSearch();
	return (
		<Button asChild variant="quiet" size="compact">
			<Link to="/" search={returnSearch}>
				<span aria-hidden="true">←</span> Runs
			</Link>
		</Button>
	);
}

export { RunIdentityReadings, RunReturnLink };
