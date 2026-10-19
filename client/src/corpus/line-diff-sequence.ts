const TRAILING_SPLIT_FIELD_OFFSET = -1;

const FIRST_LINE_INDEX = 0;

const LINE_INDEX_STEP = 1;

const LCS_BOUNDARY_CELLS = 1;

const MATCHED_LINE_PAIR_LENGTH = 1;

const EMPTY_COMMON_SUFFIX_LENGTH = 0;

interface Line {
	readonly text: string;
	/** The file's last line, ending without a newline. */
	readonly noNewline: boolean;
}

function linesOf(text: string): readonly Line[] {
	if (text === "") {
		return [];
	}
	const parts = text.split("\n");
	const terminated = parts.at(TRAILING_SPLIT_FIELD_OFFSET) === "";
	const lines = terminated
		? parts.slice(FIRST_LINE_INDEX, TRAILING_SPLIT_FIELD_OFFSET)
		: parts;

	return lines.map((line, index) => ({
		noNewline: !terminated && index === lines.length - LINE_INDEX_STEP,
		text: line,
	}));
}

function sameLine(left: Line, right: Line): boolean {
	return left.text === right.text && left.noNewline === right.noNewline;
}

/**
 * The longest common subsequence of lines from each pair of positions to the
 * end, so the walk from the start keeps as many lines as any diff can.
 */
class CommonSuffixLengths {
	private readonly width: number;
	private readonly lengths: Uint32Array;

	public constructor(before: readonly Line[], after: readonly Line[]) {
		this.width = after.length + LCS_BOUNDARY_CELLS;
		this.lengths = new Uint32Array(
			(before.length + LCS_BOUNDARY_CELLS) * this.width,
		);
		for (
			let row = before.length - LINE_INDEX_STEP;
			row >= FIRST_LINE_INDEX;
			row -= LINE_INDEX_STEP
		) {
			for (
				let column = after.length - LINE_INDEX_STEP;
				column >= FIRST_LINE_INDEX;
				column -= LINE_INDEX_STEP
			) {
				const left = before[row];
				const right = after[column];
				this.lengths[row * this.width + column] =
					left !== undefined && right !== undefined && sameLine(left, right)
						? this.at(row + LINE_INDEX_STEP, column + LINE_INDEX_STEP) +
							MATCHED_LINE_PAIR_LENGTH
						: Math.max(
								this.at(row + LINE_INDEX_STEP, column),
								this.at(row, column + LINE_INDEX_STEP),
							);
			}
		}
	}

	public at(row: number, column: number): number {
		return (
			this.lengths[row * this.width + column] ?? EMPTY_COMMON_SUFFIX_LENGTH
		);
	}
}

export {
	CommonSuffixLengths,
	FIRST_LINE_INDEX,
	LINE_INDEX_STEP,
	linesOf,
	sameLine,
};
export type { Line };
