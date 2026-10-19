import { historyError } from "#server/api-refusal";
import type { HistoryErrorResponse } from "#server/api-refusal";
import {
	EvidenceSourceError,
	readEvidenceSource,
} from "#server/evidence-source";
import type { EvidenceRequest, EvidenceSource } from "#server/evidence-source";

type EvidenceSourceAnswer =
	| { readonly found: true; readonly source: EvidenceSource }
	| { readonly found: false; readonly error: HistoryErrorResponse };

/**
 * One evidence item's recorded source, or the history error a refusal or a
 * missing item answers with, so both evidence routes answer alike.
 */
async function evidenceSourceAnswer(
	request: EvidenceRequest,
): Promise<EvidenceSourceAnswer> {
	try {
		return { found: true, source: await readEvidenceSource(request) };
	} catch (error) {
		if (!(error instanceof EvidenceSourceError)) {
			throw error;
		}

		return { error: historyError(error), found: false };
	}
}

export { evidenceSourceAnswer as default };
