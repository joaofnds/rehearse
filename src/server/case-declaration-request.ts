import { z } from "zod";

import { caseDeclarationValidationOrder } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import {
	declareCaseRequestSchema,
	refusedFieldMessages,
} from "#server/case-declaration";
import type { LaunchJsonRequest } from "#server/launches-contract";

type ParsedCaseDeclarationRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof declareCaseRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseCaseDeclarationRequest(
	request: LaunchJsonRequest,
): Promise<ParsedCaseDeclarationRequest> {
	const parsed = declareCaseRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
		{ error: refusedFieldMessages },
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: caseDeclarationValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { parseCaseDeclarationRequest as default };
