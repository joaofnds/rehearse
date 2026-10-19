import type { CorpusMeasurement } from "./corpus-measurement";

const PREFIX_START_INDEX = 0;

const CORPUS_VERSION_LABEL = "corpus@";
const VERSION_LABEL_LENGTH = 6;

/** A version's six hex characters, bare where the corpus is already the context. */
function corpusVersionHash(digest: string): string {
	return digest.slice(PREFIX_START_INDEX, VERSION_LABEL_LENGTH);
}

/** How a version is named wherever it is shown: the label and six hex characters. */
function corpusVersionLabel(digest: string): string {
	return `${CORPUS_VERSION_LABEL}${corpusVersionHash(digest)}`;
}

/** What a record says about its corpus, in the words every surface shows. */
function corpusMeasurementReading(
	measurement: CorpusMeasurement | undefined,
): string {
	if (measurement === undefined) {
		return "version not recorded";
	}

	return measurement.kind === "version"
		? corpusVersionLabel(measurement.digest)
		: `refused: ${measurement.refusal}`;
}

export {
	CORPUS_VERSION_LABEL,
	corpusVersionHash,
	corpusVersionLabel,
	corpusMeasurementReading,
};
