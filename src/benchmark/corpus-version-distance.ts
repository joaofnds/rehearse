import type { CorpusRoot } from "./corpus-file";
import hashCorpusLayout from "./corpus-layout";
import type { CorpusMeasurement } from "./corpus-measurement";
import { corpusVersionLog } from "./corpus-version-log";
import { corpusVersionDigest } from "./corpus-version-storage";

const FINAL_CORPUS_VERSION_OFFSET = -1;
const EMPTY_COLLECTION_LENGTH = 0;
const FIRST_CORPUS_POSITION = 1;

const UNLISTED_CORPUS_POSITION = 0;

const PREVIOUS_CORPUS_POSITION_OFFSET = 2;

const CORPUS_VERSION_POSITION_BASE = 1;

/**
 * How many log positions a record's version sits behind the corpus under
 * test, or why that cannot be said. Stale or clean never comes from here.
 */
type VersionDistance =
	| { readonly kind: "measured"; readonly versions: number }
	| { readonly kind: "not-recorded"; readonly reason: string };

interface CorpusUnderTest {
	/**
	 * The log entry the last edit started from: the one before the corpus
	 * under test's position, undefined when the log holds none or the corpus
	 * under test refused.
	 */
	readonly previousVersion: string | undefined;
	/**
	 * The version the corpus under test hashed as, measured or not, the one
	 * the last edit went to; undefined when it refused.
	 */
	readonly version: string | undefined;
	readonly distanceOf: (
		measurement: CorpusMeasurement | undefined,
	) => VersionDistance;
}

function notRecorded(reason: string): VersionDistance {
	return { kind: "not-recorded", reason };
}

interface VersionPosition {
	readonly current: string | undefined;
	readonly log: readonly string[];
	readonly livePosition: number;
	readonly refusals: readonly string[];
}
function distanceOfVersion(
	{ current, log, livePosition, refusals }: VersionPosition,
	measurement: CorpusMeasurement | undefined,
): VersionDistance {
	if (measurement === undefined) {
		return notRecorded("recorded before corpus versions");
	}

	if (measurement.kind === "refused") {
		return notRecorded(
			`the attempt measured no version: ${measurement.refusal}`,
		);
	}

	if (current === undefined) {
		return notRecorded(`the corpus under test refused: ${refusals.join("; ")}`);
	}

	if (measurement.digest === current) {
		return { kind: "measured", versions: 0 };
	}

	return loggedDistance(log, livePosition, measurement.digest);
}
function loggedDistance(
	log: readonly string[],
	livePosition: number,
	digest: string,
): VersionDistance {
	const position = log.lastIndexOf(digest) + FIRST_CORPUS_POSITION;
	if (position === UNLISTED_CORPUS_POSITION) {
		return notRecorded(
			"its version is not in the log of the corpus under test",
		);
	}

	return { kind: "measured", versions: livePosition - position };
}
/**
 * The corpus under test, hashed but not measured, so reading a distance adds
 * no version to its log. Its position is the latest entry's when their
 * digests match and one past it otherwise, and a version is placed at the
 * latest position it holds, so a revert counts from where it came back.
 */
async function readCorpusUnderTest(
	recordsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusUnderTest> {
	const layout = await hashCorpusLayout(source);
	const log = await corpusVersionLog(recordsDirectory, source);
	const current =
		layout.refusals.length === EMPTY_COLLECTION_LENGTH
			? corpusVersionDigest(layout.files)
			: undefined;
	const livePosition =
		log.at(FINAL_CORPUS_VERSION_OFFSET) === current
			? log.length
			: log.length + CORPUS_VERSION_POSITION_BASE;

	return {
		distanceOf(measurement) {
			return distanceOfVersion(
				{ current, livePosition, log, refusals: layout.refusals },
				measurement,
			);
		},
		previousVersion:
			current === undefined || livePosition < PREVIOUS_CORPUS_POSITION_OFFSET
				? undefined
				: log[livePosition - PREVIOUS_CORPUS_POSITION_OFFSET],
		version: current,
	};
}

export { readCorpusUnderTest as default };
export type { VersionDistance, CorpusUnderTest };
