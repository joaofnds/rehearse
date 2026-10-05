interface Line {
	readonly text: string;
	/** The file's last line, ending without a newline. */
	readonly noNewline: boolean;
}

/** One line of a diff, numbered by its position in each text that holds it. */
export type DiffLine = (
	| { readonly kind: "same"; readonly before: number; readonly after: number }
	| { readonly kind: "removed"; readonly before: number }
	| { readonly kind: "added"; readonly after: number }
) & { readonly text: string; readonly noNewline?: true };

function linesOf(text: string): readonly Line[] {
	if (text === "") {
		return [];
	}
	const parts = text.split("\n");
	const terminated = parts.at(-1) === "";
	const lines = terminated ? parts.slice(0, -1) : parts;

	return lines.map((line, index) => ({
		text: line,
		noNewline: !terminated && index === lines.length - 1,
	}));
}

function sameLine(left: Line, right: Line): boolean {
	return left.text === right.text && left.noNewline === right.noNewline;
}

function withNewlineMark<T extends object>(line: Line, entry: T): T {
	return line.noNewline ? { ...entry, noNewline: true } : entry;
}

/**
 * The longest common subsequence of lines from each pair of positions to the
 * end, so the walk from the start keeps as many lines as any diff can.
 */
class CommonSuffixLengths {
	private readonly width: number;
	private readonly lengths: Uint32Array;

	public constructor(before: readonly Line[], after: readonly Line[]) {
		this.width = after.length + 1;
		this.lengths = new Uint32Array((before.length + 1) * this.width);
		for (let row = before.length - 1; row >= 0; row -= 1) {
			for (let column = after.length - 1; column >= 0; column -= 1) {
				const left = before[row];
				const right = after[column];
				this.lengths[row * this.width + column] =
					left !== undefined && right !== undefined && sameLine(left, right)
						? this.at(row + 1, column + 1) + 1
						: Math.max(this.at(row + 1, column), this.at(row, column + 1));
			}
		}
	}

	public at(row: number, column: number): number {
		return this.lengths[row * this.width + column] ?? 0;
	}
}

/**
 * The most line pairs a diff compares, since it holds a table cell for each,
 * four bytes apiece, and is recomputed on every keystroke.
 */
const MAX_COMPARED_PAIRS = 4_000_000;

/**
 * A line diff of two texts, a changed line shown removed then added, or
 * undefined when they hold too many lines to compare here.
 */
export function lineDiff(
	beforeText: string,
	afterText: string,
): DiffLine[] | undefined {
	const before = linesOf(beforeText);
	const after = linesOf(afterText);
	if (before.length * after.length > MAX_COMPARED_PAIRS) {
		return undefined;
	}
	const lengths = new CommonSuffixLengths(before, after);
	const diff: DiffLine[] = [];
	let row = 0;
	let column = 0;
	while (row < before.length || column < after.length) {
		const removed = before[row];
		const added = after[column];
		if (
			removed !== undefined &&
			added !== undefined &&
			sameLine(removed, added)
		) {
			diff.push(
				withNewlineMark(removed, {
					kind: "same",
					text: removed.text,
					before: row + 1,
					after: column + 1,
				}),
			);
			row += 1;
			column += 1;
		} else if (
			removed !== undefined &&
			(added === undefined ||
				lengths.at(row + 1, column) >= lengths.at(row, column + 1))
		) {
			diff.push(
				withNewlineMark(removed, {
					kind: "removed",
					text: removed.text,
					before: row + 1,
				}),
			);
			row += 1;
		} else if (added !== undefined) {
			diff.push(
				withNewlineMark(added, {
					kind: "added",
					text: added.text,
					after: column + 1,
				}),
			);
			column += 1;
		}
	}

	return diff;
}
