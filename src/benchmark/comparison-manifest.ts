import { z } from "zod";

import {
	comparisonArmSchema,
	identitySchema,
} from "./comparison-record-source-schema";
import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import type { ValidationFieldOrder } from "./validation-issue-order";
import orderedValidationIssues from "./validation-issue-order";

const CASE_NUMBER_BASE = 1;

const CASE_ISSUE_PATH_PREFIX_SEGMENTS = 2;

const COMPARISON_MANIFEST_SCHEMA_VERSION = 1;

const manifestArmSchema = z.union([
	z
		.string()
		.nonempty()
		.transform((group): [string] => [group]),
	z.tuple([z.string().nonempty()]).rest(z.string().nonempty()),
]);

const manifestArmsSchema = z
	.object({
		baseline: manifestArmSchema,
		candidate: manifestArmSchema,
		control: manifestArmSchema,
	})
	.strict();

const comparisonManifestSchema = z
	.object({
		cases: z
			.array(
				z
					.object({
						arms: manifestArmsSchema,
						caseId: identitySchema,
					})
					.strict(),
			)
			.nonempty(),
		schemaVersion: z.literal(COMPARISON_MANIFEST_SCHEMA_VERSION),
	})
	.strict()
	.superRefine((manifest, context) => {
		const seen = new Set<string>();
		for (const [index, benchmarkCase] of manifest.cases.entries()) {
			if (seen.has(benchmarkCase.caseId)) {
				context.addIssue({
					code: "custom",
					message: "duplicate case ID",
					path: ["cases", index, "caseId"],
				});
			}

			seen.add(benchmarkCase.caseId);
		}
	});

type ComparisonManifest = Immutable<z.infer<typeof comparisonManifestSchema>>;

type ComparisonManifestText = Immutable<
	z.input<typeof comparisonManifestSchema>
>;

const manifestCaseContextSchema = z
	.object({ caseId: z.string().optional() })
	.loose();

const manifestContextSchema = z
	.object({
		cases: z.array(manifestCaseContextSchema).optional(),
	})
	.loose();

type ManifestContext = Immutable<z.infer<typeof manifestContextSchema>>;

const caseIssuePathSchema = z
	.tuple([z.literal("cases"), z.number().int().nonnegative()])
	.rest(z.union([z.string(), z.number()]));

interface IssueContextInput {
	readonly context: ManifestContext;
	readonly issue: {
		readonly path: readonly PropertyKey[];
	};
}

interface ManifestIssueContext {
	readonly caseId: string;
	readonly arm: string;
	readonly field: string;
}

const comparisonManifestValidationOrder: ValidationFieldOrder = {
	children: {
		cases: {
			children: {
				arms: { fields: ["baseline", "candidate", "control"] },
			},
			fields: ["caseId", "arms"],
		},
	},
	fields: ["schemaVersion", "cases"],
	refinements: [{ code: "custom", path: ["cases", "caseId"] }],
};

interface ManifestIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}

type ManifestContextReading =
	| { readonly success: true; readonly data: ManifestContext }
	| { readonly success: false };

function issueContext(
	input: Immutable<IssueContextInput>,
): ManifestIssueContext {
	const parsedPath = caseIssuePathSchema.safeParse(input.issue.path);
	const [, caseIndex] = parsedPath.data ?? [];
	const caseId =
		caseIndex === undefined
			? "manifest"
			: (input.context.cases?.[caseIndex]?.caseId ??
				`case-${caseIndex + CASE_NUMBER_BASE}`);
	const arm = input.issue.path
		.map((value) => comparisonArmSchema.safeParse(value))
		.find((result) => result.success)?.data;
	const fieldPath =
		caseIndex === undefined
			? input.issue.path
			: input.issue.path.slice(CASE_ISSUE_PATH_PREFIX_SEGMENTS);
	const field = fieldPath.map(String).join(".") || "manifest";

	return { arm: arm ?? "all", caseId, field };
}

class ComparisonManifestError extends Error {
	public override name = "ComparisonManifestError";
}

function parseComparisonManifest(text: string): ComparisonManifest {
	const documentReading = parseJsonDocument(text, comparisonManifestSchema);
	if (documentReading.kind === "invalid-json") {
		throw new ComparisonManifestError(
			"case manifest arm all field json: invalid JSON",
		);
	}

	const { parsed: result } = documentReading;
	if (result.success) {
		return result.data;
	}

	const [issue] = orderedValidationIssues({
		error: result.error,
		order: comparisonManifestValidationOrder,
	});
	if (issue === undefined) {
		throw new ComparisonManifestError(
			"case manifest arm all field manifest: invalid comparison manifest",
		);
	}

	throw invalidManifestIssue(
		manifestContextSchema.safeParse(documentReading.value),
		issue,
	);
}

function invalidManifestIssue(
	parsedContext: ManifestContextReading,
	issue: ManifestIssue,
): ComparisonManifestError {
	const context = issueContext({
		context: parsedContext.success ? parsedContext.data : {},
		issue,
	});

	return new ComparisonManifestError(
		`case ${context.caseId} arm ${context.arm} field ${context.field}: ${issue.message}`,
	);
}

export {
	ComparisonManifestError,
	comparisonManifestSchema,
	parseComparisonManifest,
};
export type { ComparisonManifest, ComparisonManifestText };
