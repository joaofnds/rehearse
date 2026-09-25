import { z } from "zod";
import type { Immutable } from "./contracts";

/**
 * What measuring a corpus source yields: the version its whole layout is, or
 * the refusal that kept it from being one. A refused layout still lets the
 * attempt run, and its record carries the refusal in place of a version.
 *
 * Records written before versions existed carry neither, so every record
 * field holding one is optional and reads as not recorded when absent.
 */
export const corpusMeasurementSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("version"),
		digest: z.string().regex(/^[0-9a-f]{64}$/u),
	}),
	z.object({ kind: z.literal("refused"), refusal: z.string().min(1) }),
]);

export type CorpusMeasurement = Immutable<
	z.infer<typeof corpusMeasurementSchema>
>;

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
