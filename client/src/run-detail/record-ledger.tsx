import type { RunRecordResponse } from "#client/monitor/run-record-query";
import useNow from "#client/run-history/use-now";
import type { PipelineRow } from "#client/shell/run-in-flight";

import LedgerCard from "./record-ledger-card";
import UnreachedStage from "./record-ledger-unreached";

const ORDINAL_BASE = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface RecordLedgerProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
}

function RecordLedger({ row, record }: RecordLedgerProps): React.JSX.Element {
	const nowMs = useNow(row.progress.state === "running");
	const unreached = record.stages.flatMap((stage, index) =>
		stage.status === "no-record"
			? [{ number: index + ORDINAL_BASE, stage }]
			: [],
	);

	return (
		<section
			aria-label="Record ledger"
			className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pt-4 pb-10"
		>
			<div className="flex min-w-0 max-w-250 flex-col gap-3">
				{record.stages.map((stage, index) =>
					stage.status === "no-record" ? null : (
						<LedgerCard
							key={stage.stage}
							row={row}
							record={record}
							stage={stage}
							number={index + ORDINAL_BASE}
							nowMs={nowMs}
						/>
					),
				)}
				{unreached.length === EMPTY_COLLECTION_LENGTH ? null : (
					<ul
						aria-label="Stages without a record"
						className="flex flex-col gap-2"
					>
						{unreached.map((each) => (
							<UnreachedStage
								key={each.stage.stage}
								unreached={each}
								row={row}
								record={record}
							/>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

export { RecordLedger as default };
