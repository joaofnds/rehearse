/**
 * Lines of text, so a last line without a newline counts and an empty file
 * holds none, since it has no line to cite.
 */
export function lineCount(text: string): number {
	if (text === "") {
		return 0;
	}

	const newlines = text.split("\n").length - 1;

	return text.endsWith("\n") ? newlines : newlines + 1;
}
