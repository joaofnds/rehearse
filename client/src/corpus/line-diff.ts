import type { Line } from "./line-diff-sequence";
import {
	CommonSuffixLengths,
	FIRST_LINE_INDEX,
	LINE_INDEX_STEP,
	linesOf,
	sameLine,
} from "./line-diff-sequence";

const LINE_NUMBER_BASE = 1;

/** One line of a diff, numbered by its position in each text that holds it. */
type DiffLine = (
	| { readonly kind: "same"; readonly before: number; readonly after: number }
	| { readonly kind: "removed"; readonly before: number }
	| { readonly kind: "added"; readonly after: number }
) & { readonly text: string; readonly noNewline?: true };

function withNewlineMark<T extends object>(line: Line, entry: T): T {
	return line.noNewline ? { ...entry, noNewline: true } : entry;
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
class LineDiffWalk {
	private row = FIRST_LINE_INDEX;
	private column = FIRST_LINE_INDEX;
	public readonly lines: DiffLine[] = [];
	private readonly lengths: CommonSuffixLengths;
	public constructor(
		private readonly before: readonly Line[],
		private readonly after: readonly Line[],
	) {
		this.lengths = new CommonSuffixLengths(before, after);
	}
	public unfinished(): boolean {
		return this.row < this.before.length || this.column < this.after.length;
	}
	public advance(): void {
		const removed = this.before[this.row];
		const added = this.after[this.column];
		if (
			removed !== undefined &&
			added !== undefined &&
			sameLine(removed, added)
		) {
			this.keep(removed);
		} else if (
			removed !== undefined &&
			(added === undefined ||
				this.lengths.at(this.row + LINE_INDEX_STEP, this.column) >=
					this.lengths.at(this.row, this.column + LINE_INDEX_STEP))
		) {
			this.remove(removed);
		} else if (added !== undefined) {
			this.add(added);
		}
	}
	private keep(line: Line): void {
		this.lines.push(
			withNewlineMark(line, {
				after: this.column + LINE_NUMBER_BASE,
				before: this.row + LINE_NUMBER_BASE,
				kind: "same",
				text: line.text,
			}),
		);
		this.row += LINE_INDEX_STEP;
		this.column += LINE_INDEX_STEP;
	}
	private remove(line: Line): void {
		this.lines.push(
			withNewlineMark(line, {
				before: this.row + LINE_NUMBER_BASE,
				kind: "removed",
				text: line.text,
			}),
		);
		this.row += LINE_INDEX_STEP;
	}
	private add(line: Line): void {
		this.lines.push(
			withNewlineMark(line, {
				after: this.column + LINE_NUMBER_BASE,
				kind: "added",
				text: line.text,
			}),
		);
		this.column += LINE_INDEX_STEP;
	}
}

function lineDiff(
	beforeText: string,
	afterText: string,
): DiffLine[] | undefined {
	const before = linesOf(beforeText);
	const after = linesOf(afterText);
	if (before.length * after.length > MAX_COMPARED_PAIRS) {
		return undefined;
	}
	const walk = new LineDiffWalk(before, after);
	while (walk.unfinished()) {
		walk.advance();
	}
	return walk.lines;
}

export { lineDiff as default };
export type { DiffLine };
