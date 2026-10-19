import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import type { LaunchJsonRequest } from "#server/launches-contract";

/** An edit, carrying the version it was opened or reviewed against. */
const corpusEditRequestSchema = z
	.object({ path: z.string(), startsFrom: z.string(), text: z.string() })
	.strict();

const corpusEditValidationOrder: ValidationFieldOrder = {
	fields: ["path", "text", "startsFrom"],
};

type ParsedCorpusEditRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof corpusEditRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseCorpusEditRequest(
	request: LaunchJsonRequest,
): Promise<ParsedCorpusEditRequest> {
	const parsed = corpusEditRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: corpusEditValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { corpusEditRequestSchema, parseCorpusEditRequest };
