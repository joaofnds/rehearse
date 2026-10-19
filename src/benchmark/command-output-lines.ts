const INITIAL_LINE_START_INDEX = 0;
const MISSING_LINE_TERMINATOR_INDEX = -1;
const LINE_TERMINATOR_CODE_UNITS = 1;
interface OutputReader {
	readonly onChunk: () => void;
	readonly onLine?: ((line: string) => void) | undefined;
}

/**
 * The whole stream as text, telling `onChunk` each time a chunk arrives and
 * handing each line to `onLine` on the way.
 */

class CommandOutputLines {
	private readonly decoder = new TextDecoder();
	private text = "";
	private lineStart = INITIAL_LINE_START_INDEX;
	public constructor(private readonly reader: OutputReader) {}
	public append(chunk: Readonly<ArrayBufferView>): void {
		this.reader.onChunk();
		this.text += this.decoder.decode(chunk, { stream: true });
		this.deliverTerminatedLines();
	}
	private deliverTerminatedLines(): void {
		let lineEnd = this.text.indexOf("\n", this.lineStart);
		while (lineEnd !== MISSING_LINE_TERMINATOR_INDEX) {
			this.reader.onLine?.(this.text.slice(this.lineStart, lineEnd));
			this.lineStart = lineEnd + LINE_TERMINATOR_CODE_UNITS;
			lineEnd = this.text.indexOf("\n", this.lineStart);
		}
	}
	public finish(): string {
		this.text += this.decoder.decode();
		if (this.lineStart < this.text.length) {
			this.reader.onLine?.(this.text.slice(this.lineStart));
		}
		return this.text;
	}
}

export { CommandOutputLines as default };
export type { OutputReader };
