import { stageScorecardSchema } from "#benchmark/contracts";
import parseJsonDocument from "#benchmark/json-document";
import {
	finalAssessmentRecordSchema,
	projectFinalAssessment,
	projectSavedStepOutput,
	savedOutputRecordSchema,
} from "#server/evidence-projection";
import type {
	FinalAssessment,
	SavedStageOutput,
} from "#server/evidence-projection";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function recordedStepOutput(text: string, stage: string): SavedStageOutput {
	const documentReading = parseJsonDocument(
		text,
		stageScorecardSchema.pick({ stage: true }),
	);
	if (documentReading.kind === "invalid-json") {
		return {
			reason: "The saved step record could not be read.",
			state: "unavailable",
		};
	}

	const { parsed: identity } = documentReading;
	if (!identity.success) {
		return {
			reason: "This record does not identify its saved step output.",
			state: "unavailable",
		};
	}

	if (identity.data.stage !== stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved output names a different step.",
		);
	}

	const parsed = savedOutputRecordSchema.safeParse(documentReading.value);
	return parsed.success
		? projectSavedStepOutput(parsed.data).output
		: {
				reason: "The saved step record does not retain readable output.",
				state: "unavailable",
			};
}

function recordedFinalAssessment(text: string): FinalAssessment {
	try {
		const document: unknown = JSON.parse(text);
		const parsed = finalAssessmentRecordSchema.safeParse(document);
		return parsed.success
			? projectFinalAssessment(parsed.data)
			: {
					reason:
						"This record retains no readable final criteria or citations.",
					state: "unavailable",
				};
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}

		return {
			reason: "The final Judge record could not be read.",
			state: "unavailable",
		};
	}
}

export { recordedStepOutput, recordedFinalAssessment };
