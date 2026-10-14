/** Lines of a file, both ends counted from 1 and included. */
export interface LineRange {
	readonly start: number;
	readonly end: number;
}

/** Character offsets into a text, the end excluded. */
export interface TextSpan {
	readonly start: number;
	readonly end: number;
}

/**
 * Where the range starts and ends in the text, each line's newline included,
 * held to the text's length when the range runs past its last line.
 */
export function lineRangeOffsets(text: string, lines: LineRange): TextSpan {
	const kept = text.split("\n").map((line) => `${line}\n`);
	const offsetBefore = (line: number): number =>
		Math.min(
			text.length,
			kept.slice(0, line - 1).reduce((sum, each) => sum + each.length, 0),
		);

	return { start: offsetBefore(lines.start), end: offsetBefore(lines.end + 1) };
}
