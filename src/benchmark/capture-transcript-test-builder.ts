import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

const NO_TRANSCRIPT_LINES = 0;
const RECORD_PADDING_CHARACTERS = 4096;
interface CaptureTranscriptOptions {
	readonly lines: number;
	readonly padding: number;
}
class CaptureTranscriptBuilder {
	readonly #options: CaptureTranscriptOptions;
	public constructor(options: Partial<CaptureTranscriptOptions> = {}) {
		this.#options = {
			lines: options.lines ?? NO_TRANSCRIPT_LINES,
			padding: options.padding ?? RECORD_PADDING_CHARACTERS,
		};
	}
	public async source(
		resources: Pick<TestResources, "track">,
	): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-source-"));
		resources.track(directory);
		const path = join(directory, "source.jsonl");
		await writeFile(
			path,
			`${Array.from({ length: this.#options.lines }, (_value, index) => JSON.stringify({ filler: "x".repeat(this.#options.padding), ordinal: index })).join("\n")}\n`,
		);

		return path;
	}
	public static async destination(
		resources: Pick<TestResources, "track">,
	): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-capture-"));
		resources.track(directory);

		return join(directory, "prefix.jsonl");
	}
}
export default CaptureTranscriptBuilder;
