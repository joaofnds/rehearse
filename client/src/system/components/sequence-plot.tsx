import type { SequencePlotPoint } from "./sequence-geometry";
import { AXIS_ORIGIN, FIRST_POINT_INDEX } from "./sequence-geometry";
import SequenceSelection from "./sequence-selection";

const NO_MISSING_ITEMS = 0;

const SINGLE_ITEM_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

interface SequencePlotProps {
	readonly label: string;
	readonly unit: string;
	readonly points: readonly SequencePlotPoint[];
	readonly selected: string | undefined;
	readonly onSelect: (id: string) => void;
	readonly formatValue: (value: number) => string;
}

function SequencePlot({
	label,
	unit,
	points,
	selected,
	onSelect,
	formatValue,
}: SequencePlotProps): React.JSX.Element {
	const maximum = Math.max(
		AXIS_ORIGIN,
		...points.flatMap(({ value }) => (value === undefined ? [] : [value])),
	);
	const missing = points.filter(({ value }) => value === undefined).length;
	const selectedIndex = points.findIndex(({ id }) => id === selected);
	const activeIndex = Math.max(FIRST_POINT_INDEX, selectedIndex);
	const active = points[activeIndex];

	return (
		<figure aria-label={label} className="min-w-0">
			<figcaption className="flex flex-wrap justify-between gap-2 text-12 text-muted-foreground">
				<span>{unit}</span>
				<span>Request order · click a point or use ← / →</span>
			</figcaption>
			<div className="overflow-x-auto p-2">
				<SequenceSelection
					label={label}
					points={points}
					activeIndex={activeIndex}
					onSelect={onSelect}
					maximum={maximum}
					selected={selected}
					formatValue={formatValue}
				/>
			</div>
			<SequenceReading
				active={active}
				unit={unit}
				formatValue={formatValue}
				missing={missing}
			/>
		</figure>
	);
}

interface SequenceReadingProps {
	readonly active: SequencePlotPoint | undefined;
	readonly unit: string;
	readonly formatValue: (value: number) => string;
	readonly missing: number;
}

function SequenceReading({
	active,
	unit,
	formatValue,
	missing,
}: SequenceReadingProps): React.JSX.Element {
	return (
		<>
			<p aria-live="polite" className="text-12 text-secondary-foreground">
				{active === undefined
					? "No requests in this scope."
					: `${active.label} · ${active.value === undefined ? "usage unavailable" : `${formatValue(active.value)} ${unit}`}`}
			</p>
			{missing === NO_MISSING_ITEMS ? null : (
				<p className="mt-1 text-12 text-muted-foreground">
					{missing} {missing === SINGLE_ITEM_COUNT ? "request" : "requests"}{" "}
					without settled usage; gaps are not zero.
				</p>
			)}
		</>
	);
}

export type { SequencePlotPoint } from "./sequence-geometry";
export { EMPTY_COLLECTION_LENGTH, SequencePlot, SINGLE_ITEM_COUNT };
