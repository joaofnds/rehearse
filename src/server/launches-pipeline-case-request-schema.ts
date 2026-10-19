import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import type { LaunchJsonRequest } from "#server/launches-contract";

/** A new pipeline case: the operator's task, another case's steps and judges. */
const pipelineCaseRequestSchema = z
	.object({
		from: z.string().nonempty(),
		id: z.string().nonempty(),
		productBrief: z.string().nonempty(),
		targetPath: z.string().nonempty(),
		task: z.string().nonempty(),
		title: z.string().nonempty(),
	})
	.strict();

const pipelineCaseValidationOrder: ValidationFieldOrder = {
	fields: ["id", "title", "targetPath", "task", "productBrief", "from"],
};

type ParsedPipelineCaseRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof pipelineCaseRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parsePipelineCaseRequest(
	request: LaunchJsonRequest,
): Promise<ParsedPipelineCaseRequest> {
	const parsed = pipelineCaseRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: pipelineCaseValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { pipelineCaseRequestSchema, parsePipelineCaseRequest };
