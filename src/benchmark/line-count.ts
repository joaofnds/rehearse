/** Lines as an editor numbers them, so a last line without a newline counts. */
export function lineCount(text: string): number {
	if (text === "") {
		return 0;
	}

	const newlines = text.split("\n").length - 1;

	return text.endsWith("\n") ? newlines : newlines + 1;
}
