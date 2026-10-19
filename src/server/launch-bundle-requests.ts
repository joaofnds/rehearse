import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import orderedValidationIssues from "#benchmark/validation-issue-order";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";
import type { LaunchJsonRequest } from "#server/launches-contract";
import {
	taskBundleSchema,
	taskBundleValidationOrder,
} from "#server/task-bundle-contract";

/**
 * The id, title and target are the importer's, since the bundle's are the
 * exporter's. The id and title are judged as a case declaration judges them.
 */
const taskImportRequestSchema = z
	.object({
		bundle: taskBundleSchema,
		id: z.string().nonempty(),
		targetPath: z.string().nonempty(),
		title: z.string().nonempty(),
	})
	.strict();

const taskImportValidationOrder: ValidationFieldOrder = {
	children: { bundle: taskBundleValidationOrder },
	fields: ["id", "title", "targetPath", "bundle"],
};

type ParsedTaskImportRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof taskImportRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseTaskImportRequest(
	request: LaunchJsonRequest,
): Promise<ParsedTaskImportRequest> {
	const parsed = taskImportRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: taskImportValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

/** A bundle to read before importing it, which writes nothing. */
const bundlePreviewRequestSchema = z
	.object({ bundle: taskBundleSchema })
	.strict();

const bundlePreviewValidationOrder: ValidationFieldOrder = {
	children: { bundle: taskBundleValidationOrder },
	fields: ["bundle"],
};

type ParsedBundlePreviewRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof bundlePreviewRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseBundlePreviewRequest(
	request: LaunchJsonRequest,
): Promise<ParsedBundlePreviewRequest> {
	const parsed = bundlePreviewRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	const issues = orderedValidationIssues({
		error: parsed.error,
		order: bundlePreviewValidationOrder,
	});

	return { error: z.prettifyError({ issues }), success: false };
}

export { parseBundlePreviewRequest, parseTaskImportRequest };
