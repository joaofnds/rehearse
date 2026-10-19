import RangePlot from "#client/system/components/range-plot";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import { DESIGN_ARMS } from "./design-arms";
import { spreadReading, spreadValue } from "./what-moved-ranges";
import {
	CANDIDATE_AGAINST_BASELINE,
	armFigure,
	armReasons,
	intervalLabel,
	measureName,
	readingOf,
} from "./what-moved-readings";

const EMPTY_COLLECTION_LENGTH = 0;

interface SpreadCellProps {
	readonly row: WhatMovedRow;
}

function SpreadCell({ row }: SpreadCellProps): React.JSX.Element {
	const plot = spreadReading(row);
	const reasons = armReasons(row);
	const missing = DESIGN_ARMS.filter(
		({ arm }) => !plot.rows.some(({ id }) => id === arm),
	);
	const change =
		row.kind === "meter"
			? row.readings[CANDIDATE_AGAINST_BASELINE]?.change
			: undefined;

	return (
		<div className="flex min-w-72 flex-col gap-2">
			{plot.rows.length === EMPTY_COLLECTION_LENGTH ? null : (
				<RangePlot
					label={`${measureName(row)} · ${intervalLabel(row)}`}
					minimum={plot.minimum}
					maximum={plot.maximum}
					formatValue={(value) => spreadValue(row, plot.rate, value)}
					valueLabel={plot.valueLabel}
					rows={plot.rows}
				/>
			)}
			<span className="text-12 text-muted-foreground">
				{intervalLabel(row)}
				{change === undefined ? "" : ` · candidate mean ${change} vs baseline`}
			</span>
			{missing.length === EMPTY_COLLECTION_LENGTH ? null : (
				<span className="text-12 text-muted-foreground">
					{missing.map(({ role }) => `${role}: range not recorded`).join(" · ")}
				</span>
			)}
			{reasons.length === EMPTY_COLLECTION_LENGTH ? null : (
				<span className="text-12 text-muted-foreground">
					{reasons.join("; ")}
				</span>
			)}
		</div>
	);
}

interface ReadingCellProps {
	readonly row: WhatMovedRow;
}

function ReadingCell({ row }: ReadingCellProps): React.JSX.Element | null {
	const reading = readingOf(row);
	return reading === undefined ? null : (
		<span className="text-14">{reading.phrase}</span>
	);
}

function whatMovedRow(row: WhatMovedRow): readonly React.ReactNode[] {
	let kind = "Recorded outcome";
	if (row.kind === "hardBlocker") {
		kind = `${row.stage} · hard blocker`;
	} else if (row.kind === "dimension") {
		kind = `${row.stage} · dimension`;
	} else if (row.kind === "meter") {
		kind = "Per-attempt mean";
	}

	return [
		<span key="measure" className="flex flex-col gap-1">
			<span className="text-14 font-medium">{measureName(row)}</span>
			<span className="text-12 text-muted-foreground">{kind}</span>
		</span>,
		...DESIGN_ARMS.map(({ arm }) => (
			<span key={arm} className="text-14 font-medium tabular-nums">
				{armFigure(row, arm)}
			</span>
		)),
		<SpreadCell key="spread" row={row} />,
		<ReadingCell key="reading" row={row} />,
	];
}

export { whatMovedRow as default };
