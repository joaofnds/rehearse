import { ScrollArea } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useRef } from "react";

import cn from "#client/system/cn";

import SectionLabel from "./section-label";
import { TableBody, TableColumnHeadings } from "./table-record-grid";

/**
 * Each row's first cell is its row header, since it names the record the
 * rest of the row describes. A column named in `numeric` holds counts or
 * amounts, so it aligns on the right edge and reads down digit by digit.
 */
interface TableShellProps {
	readonly caption: ReactNode;
	readonly columns: readonly string[];
	readonly numeric?: readonly string[];
	readonly rows: readonly (readonly ReactNode[])[];
	readonly columnClasses?: readonly string[];
	readonly className?: string;
}

function TableShell({
	caption,
	columns,
	numeric = [],
	rows,
	columnClasses,
	className,
}: TableShellProps): React.JSX.Element {
	const captionId = useId();
	const scrollHintId = useId();

	const { root, headings } = useTableGeometry();
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
							<TableColumnHeadings
								columns={columns}
								numeric={numeric}
								columnClasses={columnClasses}
							/>
						</thead>
						<TableBody rows={rows} columns={columns} numeric={numeric} />
					</table>
				</ScrollArea.Viewport>
				<TableScrollbars />
			</ScrollArea.Root>
		</div>
	);
}

interface TableGeometry {
	readonly root: RefObject<HTMLDivElement | null>;
	readonly headings: RefObject<HTMLTableSectionElement | null>;
}

function useTableGeometry(): TableGeometry {
	const root = useRef<HTMLDivElement>(null);
	const headings = useRef<HTMLTableSectionElement>(null);
	useLayoutEffect((): (() => void) | undefined => {
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
	return { headings, root };
}

function TableScrollbars(): React.JSX.Element {
	return (
		<>
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
		</>
	);
}

export { TableShell as default };
