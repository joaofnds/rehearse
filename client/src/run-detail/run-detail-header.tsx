import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import HeaderControls from "#client/monitor/run-identity-header";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import ActionGroup from "#client/system/components/action-group";
import CorpusPill from "#client/system/components/corpus-pill";
import ScreenHeader from "#client/system/components/screen-header";
import withinCase from "#client/within-case";

import { RunIdentityReadings, RunReturnLink } from "./run-identity-readings";
import type { PipelineRow } from "./run-record-readings";
import { humanReviewReading } from "./run-record-readings";

interface RunDetailHeaderProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

function RunDetailHeader({
	row,
	record,
}: RunDetailHeaderProps): React.JSX.Element {
	const { corpusVersion } = row;
	const humanState = humanReviewReading(row, record);

	return (
		<ScreenHeader
			title={withinCase(row.shortId ?? row.run, row.caseId)}
			lead={<RunReturnLink />}
			subline={
				<RunIdentityReadings
					row={row}
					record={record}
					humanState={humanState}
				/>
			}
			aside={
				<ActionGroup>
					{corpusVersion?.kind === "version" ? (
						<CorpusPill hash={corpusVersion.digest} />
					) : (
						<span className="text-14 text-muted-foreground wrap-anywhere">
							{corpusMeasurementReading(corpusVersion)}
						</span>
					)}
					{row.progress.state === "running" ? (
						<HeaderControls row={row} />
					) : null}
				</ActionGroup>
			}
		/>
	);
}

export { RunDetailHeader as default };
