import type { CorpusMeasurement } from "./corpus-measurement";

export const CORPUS_VERSION_LABEL = "corpus@";
const VERSION_LABEL_LENGTH = 6;

/** How a version is named wherever it is shown: the label and six hex characters. */
export function corpusVersionLabel(digest: string): string {
	return `${CORPUS_VERSION_LABEL}${digest.slice(0, VERSION_LABEL_LENGTH)}`;
}

/** What a record says about its corpus, in the words every surface shows. */
export function corpusMeasurementReading(
	measurement: CorpusMeasurement | undefined,
): string {
	if (measurement === undefined) {
		return "version not recorded";
	}

	return measurement.kind === "version"
		? corpusVersionLabel(measurement.digest)
		: `refused: ${measurement.refusal}`;
}
