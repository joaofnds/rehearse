import { z } from "zod";
import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import { effortSchema } from "./config";
import {
	corpusEntries,
	projectEntries,
	reconcileManifest,
} from "./context-manifest";
import { claudeCallMetricsSchema } from "./contracts";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { corpusMeasurementSchema } from "./corpus-measurement";
import { checkResultSchema } from "./session-check";
import { stateResultSchema } from "./session-state-check";
import { sessionSettingsDigest } from "./session-lineage";
import type { SessionAttempt } from "./session-attempt";
import { transcriptDiagnosticsSchema } from "./transcript";
import { contextEvidenceSchema } from "./context-evidence";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifest, readManifestSchema } from "./read-manifest";

/**
 * Where the attempt's corpus bytes were read from, recorded beside the digests
 * so the source survives the run: two runs are comparable only if the record
 * says which corpus each read. A record written before this field existed
 * carries none, and every one of those read the live install.
 */
export const corpusSnapshotOriginSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("live") }).strict(),
	z
		.object({ kind: z.literal("directory"), source: z.string().min(1) })
		.strict(),
]);

export type CorpusSnapshotOrigin = z.infer<typeof corpusSnapshotOriginSchema>;

const sha256Schema = z
	.string()
	.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest");

const corpusFileSchema = z
	.object({
		path: z.string().min(1),
		resolvedPath: z.string().min(1),
		sha256: sha256Schema,
	})
	.strict();

export const contextHalfSchema = z.enum(["corpus", "project"]);
export type ContextHalf = z.infer<typeof contextHalfSchema>;

export const manifestEntrySchema = z
	.object({
		path: z.string().min(1),
		half: contextHalfSchema,
	})
	.strict();

/**
 * The manifest is observed name-only (ACT-59, doc-9 gap 2): the transcript
 * never carries the corpus's own bytes, so an entry is a layout path and
 * nothing a hash could attach to.
 */
export const contextManifestSchema = z
	.object({
		paths: z.array(manifestEntrySchema),
	})
	.strict();

export const manifestDivergenceSchema = z
	.object({
		kind: z.enum(["undeclared-file", "unloaded-file"]),
		path: z.string().min(1),
		half: contextHalfSchema,
	})
	.strict();

/**
 * Prior to ACT-61, context manifest entries were bare layout path strings,
 * and divergences recorded only kind and path without tagging whether the
 * expected file belonged to the corpus or project half.
 */
export const legacyManifestEntrySchema = z.string().min(1);

export const legacyContextManifestSchema = z
	.object({
		paths: z.array(legacyManifestEntrySchema),
	})
	.strict();

export const legacyManifestDivergenceSchema = z
	.object({
		kind: z.enum(["undeclared-file", "unloaded-file"]),
		path: z.string().min(1),
	})
	.strict();

interface RecordedOutcome {
	readonly outcome: "SUCCESSFUL" | "UNSUCCESSFUL" | "NO_REPLY";
	readonly reply?: string | undefined;
	readonly checks: readonly { readonly status: "PASS" | "FAIL" }[];
	readonly stateResults?: readonly unknown[] | undefined;
	readonly stateGradingError?: string | undefined;
}

interface RecordProblem {
	readonly message: string;
	readonly path: string;
}

/**
 * A session that produced no reply had nothing to check, so a record carrying
 * either a reply or a check result under that outcome describes something that
 * cannot have happened. A checked attempt is the mirror: it carries the reply
 * it checked and one result per declared check, and it is successful when and
 * only when every one of them passes.
 */
function problemsWith(record: RecordedOutcome): readonly RecordProblem[] {
	const state = stateGradeProblems(record);
	if (record.outcome === "NO_REPLY") {
		return [...state, ...noReplyProblems(record)];
	}

	return [...state, ...checkedProblems(record)];
}

/**
 * A scorer either graded or it did not, so a record claiming both describes
 * something that cannot have happened, and a reader deciding whether an edit
 * helped would not know which half to believe.
 */
function stateGradeProblems(record: RecordedOutcome): readonly RecordProblem[] {
	if (
		record.stateResults === undefined ||
		record.stateGradingError === undefined
	) {
		return [];
	}

	return [
		{
			message:
				"A state grade records either its results or the reason it could not grade",
			path: "stateGradingError",
		},
	];
}

function noReplyProblems(record: RecordedOutcome): readonly RecordProblem[] {
	const problems: RecordProblem[] = [];
	if (record.reply !== undefined) {
		problems.push({
			message: "A session attempt with no reply records no reply",
			path: "reply",
		});
	}
	if (record.checks.length > 0) {
		problems.push({
			message: "A session attempt with no reply evaluates no check",
			path: "checks",
		});
	}

	return problems;
}

function checkedProblems(record: RecordedOutcome): readonly RecordProblem[] {
	const problems: RecordProblem[] = [];
	if (record.reply === undefined) {
		problems.push({
			message:
				"A session attempt that was checked records the reply it checked",
			path: "reply",
		});
	}
	if (record.checks.length === 0) {
		problems.push({
			message:
				"A checked session attempt records one result per declared check",
			path: "checks",
		});

		return problems;
	}

	const passed = record.checks.every(({ status }) => status === "PASS");
	if (passed !== (record.outcome === "SUCCESSFUL")) {
		problems.push({
			message:
				"A session attempt is successful when and only when every check passes",
			path: "outcome",
		});
	}

	return problems;
}

interface AttemptRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function refineSessionAttemptRecord(
	record: RecordedOutcome,
	context: Readonly<AttemptRefinementContext>,
): void {
	for (const problem of problemsWith(record)) {
		context.addIssue({
			code: "custom",
			message: problem.message,
			path: [problem.path],
		});
	}
}

const sessionAttemptRecordFields = {
	caseId: z.string().min(1),
	lineage: z.string().min(1),
	model: z.string().min(1),
	effort: effortSchema.optional(),
	sessionBudgetUsd: z.number().positive(),
	corpusFiles: z.array(corpusFileSchema),
	corpusOrigin: corpusSnapshotOriginSchema.optional(),
	corpusVersion: corpusMeasurementSchema.optional(),
	settingsDigest: sha256Schema.optional(),
	prompt: z.string().min(1),
	reply: z.string().optional(),
	transcriptFile: z.string().min(1),
	transcriptDiagnostics: transcriptDiagnosticsSchema.optional(),
	contextEvidence: contextEvidenceSchema.optional(),
	metrics: claudeCallMetricsSchema.optional(),
	outcome: z.enum(["SUCCESSFUL", "UNSUCCESSFUL", "NO_REPLY"]),
	checks: z.array(checkResultSchema),
	elapsedMs: z.number().nonnegative(),
};

/**
 * A state grade is either the results the scorer reported or the reason it
 * could not grade, never both: a broken scorer says nothing about the session
 * and must not read as a corpus that got worse. Only v3 carries them, because
 * a record written before this field existed graded no state, which is a
 * different fact from a scorer that reported nothing.
 */
const stateGradeFields = {
	stateResults: z.array(stateResultSchema).optional(),
	stateGradingError: z.string().min(1).optional(),
};

export const legacyUntaggedSessionAttemptRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		...sessionAttemptRecordFields,
		contextManifest: legacyContextManifestSchema,
		divergences: z.array(legacyManifestDivergenceSchema).optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

export const legacyTaggedSessionAttemptRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		...sessionAttemptRecordFields,
		contextManifest: contextManifestSchema.optional(),
		divergences: z.array(manifestDivergenceSchema).optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

export const legacySessionAttemptRecordSchema =
	legacyTaggedSessionAttemptRecordSchema;

export const executionFailedSessionAttemptRecordSchema = z
	.object({
		schemaVersion: z.literal(2),
		caseId: z.string().min(1),
		lineage: z.string().min(1),
		model: z.string().min(1),
		effort: effortSchema.optional(),
		sessionBudgetUsd: z.number().positive(),
		corpusFiles: z.array(corpusFileSchema),
		corpusOrigin: corpusSnapshotOriginSchema.optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		settingsDigest: sha256Schema.optional(),
		contextManifest: z.undefined().optional(),
		readManifest: readManifestSchema.optional(),
		divergences: z.undefined().optional(),
		prompt: z.string().min(1),
		reply: z.undefined().optional(),
		error: z.string().min(1),
		transcriptFile: z.string().min(1),
		transcriptDiagnostics: transcriptDiagnosticsSchema.optional(),
		contextEvidence: contextEvidenceSchema.optional(),
		metrics: claudeCallMetricsSchema.optional(),
		outcome: z.literal("EXECUTION_FAILED"),
		checks: z.array(checkResultSchema).length(0),
		elapsedMs: z.number().nonnegative(),
	})
	.strict();

export const sessionAttemptRecordV3Schema = z
	.object({
		schemaVersion: z.literal(3),
		...sessionAttemptRecordFields,
		...stateGradeFields,
		contextManifest: contextManifestSchema.optional(),
		divergences: z.array(manifestDivergenceSchema).optional(),
		readManifest: readManifestSchema.optional(),
	})
	.strict()
	.superRefine(refineSessionAttemptRecord);

/**
 * The shapes a writer may produce today. Reads accept every historical shape;
 * writes are held to the current contract so a regression in the builder
 * cannot silently emit a legacy record.
 */
const writableSessionAttemptRecordSchema = z.union([
	executionFailedSessionAttemptRecordSchema,
	sessionAttemptRecordV3Schema,
]);

export const sessionAttemptRecordSchema = z.union([
	legacyUntaggedSessionAttemptRecordSchema,
	legacyTaggedSessionAttemptRecordSchema,
	executionFailedSessionAttemptRecordSchema,
	sessionAttemptRecordV3Schema,
]);

export type LegacyUntaggedSessionAttemptRecord = z.infer<
	typeof legacyUntaggedSessionAttemptRecordSchema
>;
export type LegacyTaggedSessionAttemptRecord = z.infer<
	typeof legacyTaggedSessionAttemptRecordSchema
>;
export type LegacySessionAttemptRecord = LegacyTaggedSessionAttemptRecord;
export type ExecutionFailedSessionAttemptRecord = z.infer<
	typeof executionFailedSessionAttemptRecordSchema
>;
export type SessionAttemptRecordV3 = z.infer<
	typeof sessionAttemptRecordV3Schema
>;
export type SessionAttemptRecord = z.infer<typeof sessionAttemptRecordSchema>;

export function parseSessionAttemptRecord(text: string): SessionAttemptRecord {
	return sessionAttemptRecordSchema.parse(JSON.parse(text));
}

export interface SessionAttemptRecordInputs {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly lineage: string;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly corpusOrigin: CorpusSnapshotOrigin;
	readonly corpusVersion: CorpusMeasurement;
	readonly attempt: SessionAttempt;
	readonly elapsedMs: number;
	readonly error?: string | undefined;
}

interface MutableSessionAttemptRecord {
	schemaVersion: 2 | 3;
	caseId: string;
	lineage: string;
	model: string;
	effort?: SessionSettings["effort"];
	sessionBudgetUsd: number;
	corpusFiles: ResolvedCorpusFile[];
	corpusOrigin: CorpusSnapshotOrigin;
	corpusVersion?: CorpusMeasurement;
	settingsDigest?: string;
	contextManifest?: z.infer<typeof contextManifestSchema>;
	divergences?: ReturnType<typeof reconcileManifest>;
	readManifest: ReadManifestEntry[];
	prompt: string;
	reply?: string;
	error?: string;
	transcriptFile: string;
	transcriptDiagnostics: SessionAttempt["transcriptDiagnostics"];
	contextEvidence?: SessionAttempt["contextEvidence"];
	metrics?: SessionAttempt["metrics"];
	outcome: SessionAttempt["outcome"];
	checks: SessionAttempt["checks"];
	stateResults?: SessionAttempt["stateResults"];
	stateGradingError?: string;
	elapsedMs: number;
}

export function buildSessionAttemptRecord(
	inputs: Readonly<SessionAttemptRecordInputs>,
): SessionAttemptRecord {
	const { attempt, sessionCase, settings } = inputs;
	const declared = [
		...corpusEntries(sessionCase.corpusFiles),
		...projectEntries(sessionCase.projectFiles),
	];
	const record: MutableSessionAttemptRecord = {
		schemaVersion: attempt.outcome === "EXECUTION_FAILED" ? 2 : 3,
		caseId: sessionCase.declaration.id,
		lineage: inputs.lineage,
		model: settings.model,
		sessionBudgetUsd: settings.budgetUsd,
		corpusFiles: inputs.corpusFiles.map((file) => ({ ...file })),
		corpusOrigin: inputs.corpusOrigin,
		prompt: sessionCase.prompt,
		transcriptFile: attempt.transcriptFile,
		transcriptDiagnostics: transcriptDiagnosticsSchema.parse(
			attempt.transcriptDiagnostics,
		),
		outcome: attempt.outcome,
		checks: attempt.checks.map((check) => ({ ...check })),
		elapsedMs: inputs.elapsedMs,
		corpusVersion: { ...inputs.corpusVersion },
		readManifest: [
			...readManifest({
				skill: undefined,
				corpusFiles: inputs.corpusFiles,
				targetFiles: attempt.startingProjectFiles ?? [],
				declared,
				rubric: undefined,
				observed: attempt.contextManifest ?? { paths: [] },
			}),
		],
	};
	const settingsDigest = sessionSettingsDigest(sessionCase);
	if (settingsDigest !== undefined) {
		record.settingsDigest = settingsDigest;
	}
	if (settings.effort !== undefined) {
		record.effort = settings.effort;
	}
	if (attempt.reply !== undefined) {
		record.reply = attempt.reply;
	}
	if (inputs.error !== undefined) {
		record.error = inputs.error;
	}
	if (attempt.metrics !== undefined) {
		record.metrics = { ...attempt.metrics };
	}
	if (attempt.stateResults !== undefined) {
		record.stateResults = attempt.stateResults.map((result) => ({ ...result }));
	}
	if (attempt.stateGradingError !== undefined) {
		record.stateGradingError = attempt.stateGradingError;
	}
	if (attempt.contextEvidence !== undefined) {
		record.contextEvidence = contextEvidenceSchema.parse(
			attempt.contextEvidence,
		);
	}
	if (attempt.contextManifest !== undefined) {
		const manifest = contextManifestSchema.parse(attempt.contextManifest);
		record.contextManifest = {
			paths: manifest.paths.map((entry) => ({ ...entry })),
		};
		record.divergences = reconcileManifest(manifest, declared);
	}

	return writableSessionAttemptRecordSchema.parse(record);
}
