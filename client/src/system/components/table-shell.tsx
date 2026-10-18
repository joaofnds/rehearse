import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "#client/system/cn";
import { SectionLabel } from "./section-label";

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
	columnClasses,
	className,
}: {
	readonly caption: ReactNode;
	readonly columns: readonly string[];
	readonly numeric?: readonly string[];
	readonly rows: readonly (readonly ReactNode[])[];
	readonly columnClasses?: readonly string[];
	readonly className?: string;
}): React.JSX.Element {
	const captionId = useId();
	const scrollHintId = useId();

	return (
		<div
			role="region"
			aria-labelledby={`${captionId} ${scrollHintId}`}
			tabIndex={0}
			className="relative max-h-(--size-table-scroll-height) min-w-0 overflow-auto rounded-lg border border-divider"
		>
			<span id={scrollHintId} className="sr-only">
				Scrollable table
			</span>
			<table
				className={cn("w-full border-separate border-spacing-0", className)}
			>
				<caption id={captionId} className="bg-card px-4 py-4 text-left">
					<SectionLabel>{caption}</SectionLabel>
				</caption>
				<thead className="sticky top-0 bg-raised">
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
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
