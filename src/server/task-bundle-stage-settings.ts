import { z } from "zod";

import parseJsonDocument from "#benchmark/json-document";
import {
	stageSettingsFields,
	stageSettingsSchema,
} from "#benchmark/stage-settings";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import { HTTP_STATUS_BAD_REQUEST } from "#server/http-status";
import { PipelineCaseRefusalError } from "#server/pipeline-steps";

function refuseStageSettings(stageSettings: string | undefined): void {
	if (stageSettings === undefined) {
		return;
	}

	const documentReading = parseJsonDocument(stageSettings, stageSettingsSchema);
	if (documentReading.kind === "invalid-json") {
		throw new PipelineCaseRefusalError(
			"The bundle's stage settings are not valid JSON",
			HTTP_STATUS_BAD_REQUEST,
		);
	}

	const { parsed } = documentReading;
	if (!parsed.success) {
		const issues = orderedValidationIssues({
			error: parsed.error,
			order: { fields: stageSettingsFields },
		});
		throw new PipelineCaseRefusalError(
			`The bundle's stage settings are refused: ${z.prettifyError({ issues })}`,
			HTTP_STATUS_BAD_REQUEST,
		);
	}
}

export { refuseStageSettings as default };
