import type { ReactNode } from "react";

function numericMark(
	numeric: readonly string[],
	column: string,
): "" | undefined {
	return numeric.includes(column) ? "" : undefined;
}

/**
 * Each row's first cell is its row header, since it names the record the
 * rest of the row describes. A column named in `numeric` holds counts or
 * amounts, so it aligns on the right edge and reads down digit by digit.
 */
export function TableShell({
	caption,
	columns,
	numeric = [],
	rows,
}: {
	readonly caption: string;
	readonly columns: readonly string[];
	readonly numeric?: readonly string[];
	readonly rows: readonly (readonly ReactNode[])[];
}): React.JSX.Element {
	return (
		<table className="w-full border-separate border-spacing-0">
			<caption className="pb-2 text-left text-xs tracking-widest text-dim uppercase">
				{caption}
			</caption>
			<thead className="sticky top-0 bg-background">
				<tr>
					{columns.map((column) => (
						<th
							key={column}
							scope="col"
							data-numeric={numericMark(numeric, column)}
							className="border-b border-divider px-3 py-2.5 text-left text-xs font-medium tracking-widest text-dim uppercase data-numeric:text-right"
						>
							{column}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row, rowIndex) => (
					<tr key={rowIndex} className="hover:bg-row-hover">
						{row.map((cell, index) => {
							const column = columns[index];

							if (column === undefined) {
								return null;
							}

							if (index === 0) {
								return (
									<th
										key={column}
										scope="row"
										className="border-b border-subtle px-3 py-2.5 text-left align-top font-normal"
									>
										{cell}
									</th>
								);
							}

							return (
								<td
									key={column}
									data-numeric={numericMark(numeric, column)}
									className="border-b border-subtle px-3 py-2.5 align-top data-numeric:text-right data-numeric:tabular-nums"
								>
									{cell}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}
