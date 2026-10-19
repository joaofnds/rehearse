import type { LineObserver } from "./file-lines";
import { fileLines } from "./file-lines";
import CaptureError from "./session-capture-contract";
import type {
	CapturedPrefix,
	TranscriptPrefixCapture,
} from "./session-capture-contract";

const MINIMUM_TRANSCRIPT_CUT_LINE = 1;
const NO_WRITTEN_TRANSCRIPT_LINES = 0;

const BLANK_LINE_CONTRIBUTION = 0;

const NONBLANK_LINE_CONTRIBUTION = 1;

async function countLines(path: string): Promise<number> {
	let lines = 0;
	for await (const line of fileLines(path)) {
		lines +=
			line.trim() === "" ? BLANK_LINE_CONTRIBUTION : NONBLANK_LINE_CONTRIBUTION;
	}

	return lines;
}

class TranscriptPrefixWriter {
	readonly #hasher = new Bun.CryptoHasher("sha256");
	readonly #writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>;
	readonly #cut: number;
	#written = NO_WRITTEN_TRANSCRIPT_LINES;
	public constructor(destinationPath: string, cut: number) {
		this.#writer = Bun.file(destinationPath).writer();
		this.#cut = cut;
	}
	public async capture(
		sourcePath: string,
		observer: LineObserver | undefined,
	): Promise<CapturedPrefix> {
		for await (const line of fileLines(sourcePath, observer)) {
			if (this.#written === this.#cut) {
				break;
			}
			await this.append(line);
		}
		await this.#writer.end();

		return { lines: this.#written, sha256: this.#hasher.digest("hex") };
	}
	private async append(line: string): Promise<void> {
		const bytes = new TextEncoder().encode(`${line}\n`);
		this.#hasher.update(bytes);
		await this.#writer.write(bytes);
		this.#written +=
			line.trim() === "" ? BLANK_LINE_CONTRIBUTION : NONBLANK_LINE_CONTRIBUTION;
	}
}

async function captureTranscriptPrefix(
	{ sourcePath, destinationPath, cut }: TranscriptPrefixCapture,
	observer?: LineObserver,
): Promise<CapturedPrefix> {
	const total = await countLines(sourcePath);
	if (
		!Number.isInteger(cut) ||
		cut < MINIMUM_TRANSCRIPT_CUT_LINE ||
		cut > total
	) {
		throw new CaptureError(
			`Cut ${String(cut)} is outside the source's ${String(total)} lines`,
		);
	}

	const writer = new TranscriptPrefixWriter(destinationPath, cut);
	return await writer.capture(sourcePath, observer);
}
export default captureTranscriptPrefix;
