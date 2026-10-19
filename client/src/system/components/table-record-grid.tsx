import type { ReactNode } from "react";

import cn from "#client/system/cn";

import SectionLabel from "./section-label";

const FIRST_COLUMN_INDEX = 0;

function numericMark(
	numeric: readonly string[],
	column: string,
): "" | undefined {
	return numeric.includes(column) ? "" : undefined;
}

interface TableColumnHeadingsProps {
	readonly columns: readonly string[];
	readonly numeric: readonly string[];
	readonly columnClasses: readonly string[] | undefined;
}

function TableColumnHeadings({
	columns,
	numeric,
	columnClasses,
}: TableColumnHeadingsProps): React.JSX.Element {
	return (
		<>
			<tr>
				{columns.map((column, index) => (
					<th
						key={column}
						scope="col"
						data-numeric={numericMark(numeric, column)}
						className={cn(
							"border-b border-divider px-4 py-3 text-left font-medium data-numeric:text-right",
							columnClasses?.[index],
						)}
					>
						<SectionLabel>{column}</SectionLabel>
					</th>
				))}
			</tr>
		</>
	);
}

interface TableBodyProps {
	readonly rows: readonly (readonly ReactNode[])[];
	readonly columns: readonly string[];
	readonly numeric: readonly string[];
}

function TableBody({
	rows,
	columns,
	numeric,
}: TableBodyProps): React.JSX.Element {
	return (
		<tbody>
			{rows.map((row, rowIndex) => (
				<tr key={rowIndex} className="hover:bg-row-hover">
					{row.map((cell, index) => {
						const column = columns[index];

						if (column === undefined) {
							return null;
						}

						return (
							<TableCell
								key={column}
								column={column}
								cell={cell}
								index={index}
								numeric={numeric}
							/>
						);
					})}
				</tr>
			))}
		</tbody>
	);
}

interface TableCellProps {
	readonly column: string;
	readonly cell: ReactNode;
	readonly index: number;
	readonly numeric: readonly string[];
}

function TableCell({
	column,
	cell,
	index,
	numeric,
}: TableCellProps): React.JSX.Element {
	if (index === FIRST_COLUMN_INDEX) {
		return (
			<th
				key={column}
				scope="row"
				className="border-b border-subtle px-4 py-4 text-left align-top font-normal wrap-anywhere"
			>
				{cell}
			</th>
		);
	}
	return (
		<td
			key={column}
			data-numeric={numericMark(numeric, column)}
			className="border-b border-subtle px-4 py-4 align-top wrap-anywhere data-numeric:text-right data-numeric:tabular-nums"
		>
			{cell}
		</td>
	);
}

export { TableBody, TableColumnHeadings };
