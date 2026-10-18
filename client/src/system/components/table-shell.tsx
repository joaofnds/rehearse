import { useId, useLayoutEffect, useRef } from "react";
import { ScrollArea } from "radix-ui";
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
	const root = useRef<HTMLDivElement>(null);
	const headings = useRef<HTMLTableSectionElement>(null);

	useLayoutEffect(() => {
		const frame = root.current;
		const header = headings.current;
		if (frame === null || header === null) {
			return undefined;
		}

		const placeScrollbar = (): void => {
			frame.style.setProperty(
				"--table-header-height",
				`${String(header.getBoundingClientRect().height)}px`,
			);
		};
		placeScrollbar();
		const observer = new ResizeObserver(placeScrollbar);
		observer.observe(header);

		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<div className="relative flex max-h-(--size-table-scroll-height) min-w-0 flex-col overflow-hidden rounded-lg border border-divider">
			<div id={captionId} className="shrink-0 bg-card px-4 py-4 text-left">
				<SectionLabel>{caption}</SectionLabel>
			</div>
			<ScrollArea.Root
				ref={root}
				type="auto"
				className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
			>
				<ScrollArea.Viewport
					role="region"
					aria-labelledby={`${captionId} ${scrollHintId}`}
					tabIndex={0}
					className="relative min-h-0 w-full flex-1 focus-visible:-outline-offset-2"
				>
					<span id={scrollHintId} className="sr-only">
						Scrollable table
					</span>
					<table
						aria-labelledby={captionId}
						className={cn("w-full border-separate border-spacing-0", className)}
					>
						<thead ref={headings} className="sticky top-0 z-10 bg-card">
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
				</ScrollArea.Viewport>
				<ScrollArea.Scrollbar
					orientation="vertical"
					className="top-(--table-header-height)! z-20 flex w-2.5 touch-none p-0.5 select-none"
				>
					<ScrollArea.Thumb className="relative flex-1 rounded-full bg-strong/70 hover:bg-stronger" />
				</ScrollArea.Scrollbar>
				<ScrollArea.Scrollbar
					orientation="horizontal"
					className="z-20 flex h-2.5 touch-none flex-col p-0.5 select-none"
				>
					<ScrollArea.Thumb className="relative flex-1 rounded-full bg-strong/70 hover:bg-stronger" />
				</ScrollArea.Scrollbar>
			</ScrollArea.Root>
		</div>
	);
}
