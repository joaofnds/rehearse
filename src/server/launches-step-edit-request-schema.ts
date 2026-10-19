import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import {
	pipelineStageValidationOrder,
	pipelineStagesSchema,
} from "#benchmark/pipeline";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import type { LaunchJsonRequest } from "#server/launches-contract";

/**
 * Each step is parsed here as the harness declares one. Whether the rubric it
 * names fits is checked against the case it lands in.
 */
const stepEditRequestSchema = z
	.object({ stages: pipelineStagesSchema })
	.strict();

const stepEditValidationOrder: ValidationFieldOrder = {
	children: { stages: pipelineStageValidationOrder },
	fields: ["stages"],
};

type ParsedStepEditRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof stepEditRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseStepEditRequest(
	request: LaunchJsonRequest,
): Promise<ParsedStepEditRequest> {
	const parsed = stepEditRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: stepEditValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { stepEditRequestSchema, parseStepEditRequest };
