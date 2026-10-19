const LINE_NUMBER_BASE = 1;

const LINE_NUMBER_STEP = 1;

const PREFIX_START_INDEX = 0;

const EMPTY_CHARACTER_TOTAL = 0;

/** Lines of a file, both ends counted from 1 and included. */
interface LineRange {
	readonly start: number;
	readonly end: number;
}

/** Character offsets into a text, the end excluded. */
interface TextSpan {
	readonly start: number;
	readonly end: number;
}

/**
 * Where the range starts and ends in the text, each line's newline included,
 * held to the text's length when the range runs past its last line.
 */
function lineRangeOffsets(text: string, lines: LineRange): TextSpan {
	const kept = text.split("\n").map((line) => `${line}\n`);
	const offsetBefore = (line: number): number =>
		Math.min(
			text.length,
			kept
				.slice(PREFIX_START_INDEX, line - LINE_NUMBER_BASE)
				.reduce((sum, each) => sum + each.length, EMPTY_CHARACTER_TOTAL),
		);

	return {
		end: offsetBefore(lines.end + LINE_NUMBER_STEP),
		start: offsetBefore(lines.start),
	};
}

export { lineRangeOffsets as default };
export type { LineRange, TextSpan };
