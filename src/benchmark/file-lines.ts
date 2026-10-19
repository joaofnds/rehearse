interface LineObserver {
	readonly carry: (characters: number) => void;
}

/**
 * Session files run to several megabytes, so a file's lines are read as a
 * stream of chunks and split on the way through: holding one as a string would
 * put a whole transcript in memory to look at a few of its records. The carry
 * is the partial line spanning two chunks, reported so a test can observe that
 * the whole file is never held.
 */
async function* fileLines(
	path: string,
	observer?: LineObserver,
): AsyncGenerator<string> {
	for await (const line of terminatedFileLines(path, observer)) {
		yield line.text;
	}
}

interface FileLine {
	readonly text: string;
	readonly terminated: boolean;
}

/**
 * The same stream, keeping whether each line ended with a newline in the
 * source. A copy that must differ from its source in nothing but a rewritten
 * value needs that, because a file ending without a newline and one ending with
 * it are different bytes.
 */

class TerminatedFileLines {
	private readonly decoder = new TextDecoder();
	private carry = "";
	public constructor(private readonly observer: LineObserver | undefined) {}
	public *append(chunk: Readonly<ArrayBufferView>): Generator<FileLine> {
		this.carry += this.decoder.decode(chunk, { stream: true });
		this.observer?.carry(this.carry.length);
		const parts = this.carry.split("\n");
		this.carry = parts.pop() ?? "";
		for (const text of parts) {
			yield { terminated: true, text };
		}
	}
	public *finish(): Generator<FileLine> {
		this.carry += this.decoder.decode();
		if (this.carry !== "") {
			yield { terminated: false, text: this.carry };
		}
	}
}
async function* terminatedFileLines(
	path: string,
	observer?: LineObserver,
): AsyncGenerator<FileLine> {
	const lines = new TerminatedFileLines(observer);
	for await (const chunk of Bun.file(path).stream()) {
		yield* lines.append(chunk);
	}
	yield* lines.finish();
}

export { fileLines, terminatedFileLines };
export type { LineObserver, FileLine };
