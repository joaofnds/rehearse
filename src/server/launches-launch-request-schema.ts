import { z } from "zod";

import { isCaseId } from "#benchmark/case";
import { isConfirmationIdentity } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { launchAttemptsSchema } from "#benchmark/launch-record";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import type { LaunchJsonRequest } from "#server/launches-contract";

const launchRequestSchema = z.discriminatedUnion("kind", [
	z
		.object({
			attempts: launchAttemptsSchema,
			caseId: z.string().refine(isCaseId, "is not a case id"),
			kind: z.literal("case"),
		})
		.strict(),
	z
		.object({
			attempts: launchAttemptsSchema,
			kind: z.literal("replay"),
			run: z.string(),
			stage: z.string(),
		})
		.strict(),
	z
		.object({
			armA: z.string().refine(isConfirmationIdentity, "is not a group id"),
			armB: z.string().refine(isConfirmationIdentity, "is not a group id"),
			kind: z.literal("comparison"),
		})
		.strict(),
	z
		.object({
			attempts: z.number().int().positive(),
			comparison: z.string().regex(/^[0-9a-f]{64}$/u, "is not a comparison"),
			kind: z.literal("extension"),
			/** The cost the dialog stated, which the operator's click approved. */
			statedUsd: z.number().nonnegative(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("analysis"),
			run: z.string(),
			/** The most the dialog stated the call could spend. */
			statedUsd: z.number().nonnegative(),
		})
		.strict(),
]);

const launchRequestValidationOrder: ValidationFieldOrder = {
	fields: [
		"kind",
		"caseId",
		"run",
		"stage",
		"comparison",
		"attempts",
		"statedUsd",
		"armA",
		"armB",
	],
};

type ParsedLaunchRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof launchRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseLaunchRequest(
	request: LaunchJsonRequest,
): Promise<ParsedLaunchRequest> {
	const parsed = launchRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: launchRequestValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { launchRequestSchema, parseLaunchRequest };
