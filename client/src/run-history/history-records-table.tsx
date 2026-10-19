import TableShell from "#client/system/components/table-shell";

import type { ArmChoice } from "./history-comparison-choice";
import { corpusCell } from "./history-corpus-state";
import taskGradeCell from "./history-final-grades";
import { costCell, wallCell } from "./history-record-figures";
import { caseCell, runCell } from "./history-record-identities";
import outcomeCell from "./history-row-outcomes";
import { stepGradesCell } from "./history-session-grades";
import { COLUMNS, NUMERIC_COLUMNS } from "./history-table-contract";
import type { HistoryView } from "./use-history-view";

interface HistoryTableProps {
	readonly rows: HistoryView["rows"];
	readonly nowMs: number;
	readonly choice: ArmChoice;
}

function HistoryTable({
	rows,
	nowMs,
	choice,
}: HistoryTableProps): React.JSX.Element {
	return (
		<TableShell
			caption="Run history"
			className="min-w-320 table-fixed"
			columnClasses={[
				"w-28",
				"w-44",
				"w-56",
				"w-60",
				"w-40",
				"w-48",
				"w-32",
				"w-32",
			]}
			columns={[...COLUMNS]}
			numeric={[...NUMERIC_COLUMNS]}
			rows={rows.map((row) => [
				<span key="run">{runCell(row, nowMs)}</span>,
				<span key="case">{caseCell(row)}</span>,
				outcomeCell(row, choice),
				stepGradesCell(row),
				taskGradeCell(row),
				corpusCell(row),
				costCell(row),
				wallCell(row, nowMs),
			])}
		/>
	);
}

export { HistoryTable as default };
