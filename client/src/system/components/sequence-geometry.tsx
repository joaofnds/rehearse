const SINGLE_POINT_COUNT = 1;

const AXIS_ORIGIN = 0;

const AXIS_MIDPOINT_DIVISOR = 2;

const FIRST_POINT_INDEX = 0;

const POINT_INDEX_STEP = 1;

interface SequencePlotPoint {
	readonly id: string;
	readonly label: string;
	readonly value: number | undefined;
}

const LEFT = 55;

const RIGHT = 600;

const TOP = 15;

const BOTTOM = 145;

function position(index: number, count: number): number {
	return count <= SINGLE_POINT_COUNT
		? (LEFT + RIGHT) / AXIS_MIDPOINT_DIVISOR
		: LEFT + (index / (count - POINT_INDEX_STEP)) * (RIGHT - LEFT);
}

function height(value: number, maximum: number): number {
	return maximum === AXIS_ORIGIN
		? BOTTOM
		: BOTTOM - (value / maximum) * (BOTTOM - TOP);
}

function segments(
	points: readonly SequencePlotPoint[],
	maximum: number,
): readonly string[] {
	const paths: string[] = [];
	let current = "";
	for (const [index, point] of points.entries()) {
		if (point.value === undefined) {
			if (current !== "") {
				paths.push(current);
				current = "";
			}
		} else {
			current += `${current === "" ? "M" : "L"}${position(index, points.length)} ${height(point.value, maximum)} `;
		}
	}
	return current === "" ? paths : [...paths, current];
}

export {
	AXIS_MIDPOINT_DIVISOR,
	AXIS_ORIGIN,
	FIRST_POINT_INDEX,
	LEFT,
	POINT_INDEX_STEP,
	RIGHT,
	height,
	position,
	segments,
};
export type { SequencePlotPoint };
