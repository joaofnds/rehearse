import type { CorpusRoot } from "./corpus-file";
import type { CorpusUnderTest } from "./corpus-version";
import { readCorpusUnderTest } from "./corpus-version";

const NO_HASH_CALLS = 0;
const NO_JUDGMENT_CALLS = 0;

/**
 * The real reader of the corpus under test, counting each hash of the corpus
 * and each record whose version distance the reading is asked for, which is
 * one per judged record but an initial checkpoint.
 */
class CountingCorpusReader {
	public hashes = NO_HASH_CALLS;
	public judgments = NO_JUDGMENT_CALLS;

	public readonly read = async (
		recordsDirectory: string,
		source: CorpusRoot,
	): Promise<CorpusUnderTest> => {
		this.hashes += 1;
		const underTest = await readCorpusUnderTest(recordsDirectory, source);

		return {
			distanceOf: (measurement) => {
				this.judgments += 1;

				return underTest.distanceOf(measurement);
			},
			previousVersion: underTest.previousVersion,
			version: underTest.version,
		};
	};
}

export { CountingCorpusReader as default };
