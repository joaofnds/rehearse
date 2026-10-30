import { z } from "zod";

import type { Immutable } from "./contracts";
import effortSchema from "./effort";
import parseJsonDocument from "./json-document";
import { jsonObjectSchema } from "./json-value";
import { checkSchema } from "./session-check";
import { stateCheckSchema } from "./session-state-check";
import type { ValidationFieldOrder } from "./validation-issue-order";
import orderedValidationIssues from "./validation-issue-order";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

class CaseDeclarationError extends Error {
	public override name = "CaseDeclarationError";
}

const caseIdSchema = z
	.string()
	.regex(
		/^[a-z0-9][a-z0-9-]*$/u,
		"must be lowercase letters, digits, or dashes",
	);

/**
 * A case id names a directory under `cases/`, so every route into a case —
 * the declaration parser, `case show`, and a `case:` record id — asks this one
 * question rather than each deciding for itself what a case id is.
 */
function isCaseId(text: string): boolean {
	return caseIdSchema.safeParse(text).success;
}

const caseRelativePathSchema = z.string().nonempty();

/**
 * `.gitignore` keeps an unpublished prefix out of a commit by matching this
 * shape, so widening it here without widening the rule there publishes one.
 */
const transcriptFileSchema = z
	.string()
	.regex(
		/^[^/]+\.jsonl$/u,
		"A transcript prefix is a .jsonl file name in the case directory",
	);

const transcriptPrefixSchema = z
	.object({
		cut: z.number().int().positive(),
		file: transcriptFileSchema,
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
		sourceSession: z.string().nonempty(),
	})
	.strict();

type TranscriptPrefix = z.infer<typeof transcriptPrefixSchema>;

const declaredModelSchema = z.string().nonempty().optional();

const declaredSessionBudgetUsdSchema = z.number().positive().optional();

const sessionCaseDeclarationSchema = z
	.object({
		agents: jsonObjectSchema.optional(),
		archived: z.boolean().optional(),
		checks: z.array(checkSchema).nonempty(),
		corpusFiles: z.array(z.string().nonempty()),
		effort: effortSchema.optional(),
		fixture: caseRelativePathSchema.optional(),
		id: caseIdSchema,
		isolated: z.boolean().optional(),
		kind: z.literal("session"),
		model: declaredModelSchema,
		projectFiles: z.array(z.string().nonempty()).default([]),
		prompt: z.string().nonempty(),
		sessionBudgetUsd: declaredSessionBudgetUsdSchema,
		settings: jsonObjectSchema.optional(),
		stateCheck: stateCheckSchema.optional(),
		title: z.string().nonempty(),
		tools: z.array(z.string().nonempty()),
		transcript: transcriptPrefixSchema.optional(),
	})
	.strict();

const targetDefinitionSchema = z
	.object({ path: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS) })
	.strict();

const caseDeclarationSchema = z.discriminatedUnion("kind", [
	z
		.object({
			archived: z.boolean().optional(),
			effort: effortSchema.optional(),
			finalRubric: caseRelativePathSchema,
			id: caseIdSchema,
			kind: z.literal("pipeline"),
			model: declaredModelSchema,
			pipeline: caseRelativePathSchema,
			productBrief: caseRelativePathSchema,
			rubrics: caseRelativePathSchema,
			sessionBudgetUsd: declaredSessionBudgetUsdSchema,
			settingsFile: caseRelativePathSchema.optional(),
			target: targetDefinitionSchema,
			task: caseRelativePathSchema,
			title: z.string().nonempty(),
		})
		.strict(),
	sessionCaseDeclarationSchema,
]);

type CaseDeclaration = Immutable<z.infer<typeof caseDeclarationSchema>>;

type SessionCaseDeclaration = Extract<
	CaseDeclaration,
	{ readonly kind: "session" }
>;

type PipelineCaseDeclaration = Extract<
	CaseDeclaration,
	{ readonly kind: "pipeline" }
>;

// The variants share their leading identity fields and trailing model settings;
// their other fields are disjoint, so this sequence preserves each variant's
// historical diagnostic priority without re-parsing an invalid declaration.
const caseDeclarationValidationOrder: ValidationFieldOrder = {
	children: {
		checks: {
			children: {
				patterns: { fields: ["name", "regex", "flags"] },
			},
			fields: ["kind", "min", "max", "names", "strings", "patterns", "paths"],
		},
		stateCheck: { fields: ["command", "outcomes"] },
		target: { fields: ["path"] },
		transcript: { fields: ["file", "sha256", "sourceSession", "cut"] },
	},
	fields: [
		"id",
		"kind",
		"title",
		"archived",
		"fixture",
		"prompt",
		"transcript",
		"tools",
		"isolated",
		"settings",
		"agents",
		"corpusFiles",
		"projectFiles",
		"checks",
		"stateCheck",
		"task",
		"productBrief",
		"finalRubric",
		"pipeline",
		"rubrics",
		"target",
		"settingsFile",
		"model",
		"effort",
		"sessionBudgetUsd",
	],
};

function invalidCaseField(error: Immutable<z.ZodError>): string {
	const [issue] = orderedValidationIssues({
		error,
		order: caseDeclarationValidationOrder,
	});
	const field = issue?.path.join(".");

	return `${field === undefined || field === "" ? "declaration" : field}: ${issue?.message ?? "invalid declaration"}`;
}

function parseCaseDeclaration(id: string, text: string): CaseDeclaration {
	const documentReading = parseJsonDocument(text, caseDeclarationSchema);
	if (documentReading.kind === "invalid-json") {
		const { error } = documentReading;
		throw new CaseDeclarationError(
			`Case ${id} declaration is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const { parsed } = documentReading;
	if (!parsed.success) {
		throw new CaseDeclarationError(
			`Case ${id} declaration has an invalid ${invalidCaseField(parsed.error)}`,
		);
	}

	if (parsed.data.id !== id) {
		throw new CaseDeclarationError(
			`Case declaration id ${parsed.data.id} does not match its directory name ${id}`,
		);
	}

	return parsed.data;
}

export {
	CaseDeclarationError,
	isCaseId,
	transcriptPrefixSchema,
	sessionCaseDeclarationSchema,
	caseDeclarationSchema,
	caseDeclarationValidationOrder,
	parseCaseDeclaration,
};
export type {
	TranscriptPrefix,
	CaseDeclaration,
	SessionCaseDeclaration,
	PipelineCaseDeclaration,
};
