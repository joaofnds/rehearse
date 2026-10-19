import cn from "#client/system/cn";

import type { SequencePlotPoint } from "./sequence-geometry";
import {
	AXIS_MIDPOINT_DIVISOR,
	AXIS_ORIGIN,
	LEFT,
	RIGHT,
	height,
	position,
	segments,
} from "./sequence-geometry";

const EMPTY_COLLECTION_LENGTH = 0;

const SINGLE_ITEM_COUNT = 1;

const VIEWBOX_WIDTH = 640;

const VIEWBOX_HEIGHT = 180;

const AXIS_LABEL_GAP = 8;

const AXIS_LABEL_BASELINE_OFFSET = 4;

const SELECTED_POINT_RADIUS = 6;

const POINT_RADIUS = 3;

interface SequenceCanvasProps {
	readonly points: readonly SequencePlotPoint[];
	readonly maximum: number;
	readonly selected: string | undefined;
	readonly formatValue: (value: number) => string;
}

function SequenceCanvas({
	points,
	maximum,
	selected,
	formatValue,
}: SequenceCanvasProps): React.JSX.Element {
	const ticks =
		maximum === AXIS_ORIGIN
			? [AXIS_ORIGIN]
			: [AXIS_ORIGIN, maximum / AXIS_MIDPOINT_DIVISOR, maximum];

	return (
		<svg
			aria-hidden="true"
			viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
			className="w-full"
		>
			{ticks.map((tick) => (
				<SequenceTick
					key={tick}
					tick={tick}
					maximum={maximum}
					formatValue={formatValue}
				/>
			))}
			<SequenceLineMarks points={points} maximum={maximum} />
			<SequencePointMarks
				points={points}
				maximum={maximum}
				selected={selected}
			/>
			<SequenceOrderLabels count={points.length} />
		</svg>
	);
}

interface SequenceTickProps {
	readonly tick: number;
	readonly maximum: number;
	readonly formatValue: (value: number) => string;
}

function SequenceTick({
	tick,
	maximum,
	formatValue,
}: SequenceTickProps): React.JSX.Element {
	return (
		<g key={tick}>
			<line
				x1={LEFT}
				x2={RIGHT}
				y1={height(tick, maximum)}
				y2={height(tick, maximum)}
				className="stroke-strong"
			/>
			<text
				x={LEFT - AXIS_LABEL_GAP}
				y={height(tick, maximum) + AXIS_LABEL_BASELINE_OFFSET}
				textAnchor="end"
				className="fill-muted-foreground font-sans text-12"
			>
				{formatValue(tick)}
			</text>
		</g>
	);
}

interface SequenceLineMarksProps {
	readonly points: readonly SequencePlotPoint[];
	readonly maximum: number;
}

function SequenceLineMarks({
	points,
	maximum,
}: SequenceLineMarksProps): React.JSX.Element {
	return (
		<>
			{segments(points, maximum).map((path, index) => (
				<path
					key={index}
					d={path}
					fill="none"
					strokeWidth={2}
					className="stroke-primary"
				/>
			))}
		</>
	);
}

interface SequencePointMarksProps {
	readonly points: readonly SequencePlotPoint[];
	readonly maximum: number;
	readonly selected: string | undefined;
}

function SequencePointMarks({
	points,
	maximum,
	selected,
}: SequencePointMarksProps): React.JSX.Element {
	return (
		<>
			{points.map((point, index) =>
				point.value === undefined ? null : (
					<circle
						key={point.id}
						cx={position(index, points.length)}
						cy={height(point.value, maximum)}
						r={point.id === selected ? SELECTED_POINT_RADIUS : POINT_RADIUS}
						className={cn(
							"fill-primary",
							point.id === selected && "fill-pale stroke-pale",
						)}
					/>
				),
			)}
		</>
	);
}

interface SequenceOrderLabelsProps {
	readonly count: number;
}

function SequenceOrderLabels({
	count,
}: SequenceOrderLabelsProps): React.JSX.Element {
	return (
		<>
			<text
				x={LEFT}
				y={169}
				textAnchor="middle"
				className="fill-muted-foreground font-sans text-12"
			>
				{count === EMPTY_COLLECTION_LENGTH ? "" : "1"}
			</text>
			{count <= SINGLE_ITEM_COUNT ? null : (
				<text
					x={RIGHT}
					y={169}
					textAnchor="middle"
					className="fill-muted-foreground font-sans text-12"
				>
					{count}
				</text>
			)}
		</>
	);
}

export { VIEWBOX_WIDTH, SequenceCanvas as default };
