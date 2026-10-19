import SequenceCanvas, { VIEWBOX_WIDTH } from "./sequence-canvas";
import type { SequencePlotPoint } from "./sequence-geometry";
import {
	FIRST_POINT_INDEX,
	LEFT,
	POINT_INDEX_STEP,
	RIGHT,
} from "./sequence-geometry";

const EMPTY_COLLECTION_LENGTH = 0;

const KEYBOARD_CLICK_DETAIL = 0;

interface SequenceSelectionProps {
	readonly label: string;
	readonly points: readonly SequencePlotPoint[];
	readonly activeIndex: number;
	readonly onSelect: (id: string) => void;
	readonly maximum: number;
	readonly selected: string | undefined;
	readonly formatValue: (value: number) => string;
}

function SequenceSelection({
	label,
	points,
	activeIndex,
	onSelect,
	maximum,
	selected,
	formatValue,
}: SequenceSelectionProps): React.JSX.Element {
	return (
		<button
			type="button"
			aria-label={`${label}. Use left and right arrows to select a request.`}
			className="block min-w-sequence-plot w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
			disabled={points.length === EMPTY_COLLECTION_LENGTH}
			onClick={(event) => {
				selectSequencePointer(event, { activeIndex, onSelect, points });
			}}
			onKeyDown={(event) => {
				selectSequenceKey(event, { activeIndex, onSelect, points });
			}}
		>
			<SequenceCanvas
				points={points}
				maximum={maximum}
				selected={selected}
				formatValue={formatValue}
			/>
		</button>
	);
}

interface SequenceInteraction {
	readonly points: readonly SequencePlotPoint[];
	readonly activeIndex: number;
	readonly onSelect: (id: string) => void;
}

function pointAt(
	points: readonly SequencePlotPoint[],
	index: number,
): SequencePlotPoint | undefined {
	return points[
		Math.max(
			FIRST_POINT_INDEX,
			Math.min(points.length - POINT_INDEX_STEP, index),
		)
	];
}

function selectSequencePointer(
	event: SequencePointer,
	{ points, activeIndex, onSelect }: SequenceInteraction,
): void {
	const rect = event.currentTarget.getBoundingClientRect();
	const plotX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
	const index =
		event.detail === KEYBOARD_CLICK_DETAIL
			? activeIndex
			: Math.round(
					((plotX - LEFT) / (RIGHT - LEFT)) *
						(points.length - POINT_INDEX_STEP),
				);
	const point = pointAt(points, index);
	if (point !== undefined) {
		onSelect(point.id);
	}
}

function keyboardPoint(
	key: string,
	current: number,
	count: number,
): number | undefined {
	switch (key) {
		case "ArrowLeft": {
			return current - POINT_INDEX_STEP;
		}
		case "ArrowRight": {
			return current + POINT_INDEX_STEP;
		}
		case "Home": {
			return FIRST_POINT_INDEX;
		}
		case "End": {
			return count - POINT_INDEX_STEP;
		}
		default: {
			return undefined;
		}
	}
}

function selectSequenceKey(
	event: Readonly<
		Pick<React.KeyboardEvent<HTMLButtonElement>, "key" | "preventDefault">
	>,
	{ points, activeIndex, onSelect }: SequenceInteraction,
): void {
	const index = keyboardPoint(event.key, activeIndex, points.length);
	if (index === undefined) {
		return;
	}
	event.preventDefault();
	const point = pointAt(points, index);
	if (point !== undefined) {
		onSelect(point.id);
	}
}

interface SequencePointer {
	readonly clientX: number;
	readonly detail: number;
	readonly currentTarget: Readonly<
		Pick<HTMLButtonElement, "getBoundingClientRect">
	>;
}

export { SequenceSelection as default };
