const EMPTY_FILE_LINE_COUNT = 0;
const TRAILING_SPLIT_FIELD_COUNT = 1;
const UNTERMINATED_FINAL_LINE_COUNT = 1;
/**
 * Lines of text, so a last line without a newline counts and an empty file
 * holds none, since it has no line to cite.
 */
function lineCount(text: string): number {
	if (text === "") {
		return EMPTY_FILE_LINE_COUNT;
	}

	const newlines = text.split("\n").length - TRAILING_SPLIT_FIELD_COUNT;

	return text.endsWith("\n")
		? newlines
		: newlines + UNTERMINATED_FINAL_LINE_COUNT;
}

export { lineCount as default };
