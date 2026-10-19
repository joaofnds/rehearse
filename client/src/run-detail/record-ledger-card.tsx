import { useId, useState } from "react";

import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { PipelineRow } from "#client/shell/run-in-flight";

import { CardHeader } from "./record-ledger-card-header";
import {
	FullSession,
	WideEvidence,
	citedItems,
} from "./record-ledger-evidence";
import { CardBody, CardFooter } from "./record-ledger-judgment";
import { cardEvidence, stepName } from "./record-ledger-model";
import useLedgerCardReadings from "./use-ledger-card-readings";

interface LedgerCardProps {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly nowMs: number;
}

function LedgerCard(props: LedgerCardProps): React.JSX.Element {
	const reading = useLedgerCardReadings(props);
	const [expanded, setExpanded] = useState(false);
	const evidenceId = useId();

	return (
		<article
			aria-label={stepName({ number: props.number, stage: props.stage })}
			className={`min-w-0 overflow-hidden rounded-card border bg-card ${reading.status.state === "stopped" ? "border-deeper" : "border-border"}`}
		>
			<CardHeader
				stage={props.stage}
				number={props.number}
				status={reading.status}
				meta={reading.meta}
			/>
			<CardBody judge={reading.judgeRead} leftWaiting={reading.leftWaiting} />
			<CardFooter
				row={props.row}
				record={props.record}
				stage={props.stage}
				evidence={cardEvidence(reading.judgeRead, reading.leftWaiting)}
				shown={expanded ? evidenceId : undefined}
				onToggle={() => {
					setExpanded((open) => !open);
				}}
			/>
			{expanded && reading.judged !== undefined ? (
				<WideEvidence
					id={evidenceId}
					items={citedItems(
						{ run: props.row.run, stage: props.stage.stage },
						reading.judged,
					)}
					fullSession={
						<FullSession
							run={props.row.run}
							stage={props.stage.stage}
							session={reading.session}
						/>
					}
				/>
			) : null}
		</article>
	);
}

export { LedgerCard as default };
export type { LedgerCardProps };
