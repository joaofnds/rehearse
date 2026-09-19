import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { CONTROL_DIR } from "./config";
import type { JsonObject } from "./json-value";
import { jsonObjectSchema } from "./json-value";
import type { Immutable, StageRubric } from "./contracts";
import type { PipelineDefinition } from "./pipeline";
import { loadPipeline } from "./pipeline";
import type { Check } from "./session-check";
import { checkSchema } from "./session-check";
import type { StateCheck } from "./session-state-check";
import { stateCheckSchema } from "./session-state-check";
import { loadStageRubric } from "./stage-grading";
import { DEFAULT_STAGE_SETTINGS_FILE } from "./stage-settings";

export const CASES_DIRECTORY = "cases";

export class CaseDeclarationError extends Error {
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
export function isCaseId(text: string): boolean {
	return caseIdSchema.safeParse(text).success;
}

const caseRelativePathSchema = z.string().min(1);

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

export const transcriptPrefixSchema = z
	.object({
		file: transcriptFileSchema,
		sha256: z.string().regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
		sourceSession: z.string().min(1),
		cut: z.number().int().positive(),
	})
	.strict();

export type TranscriptPrefix = z.infer<typeof transcriptPrefixSchema>;

const declaredModelSchema = z.string().min(1).optional();
const declaredSessionBudgetUsdSchema = z.number().positive().optional();

export const caseDeclarationSchema = z.discriminatedUnion("kind", [
	z
		.object({
			id: caseIdSchema,
			kind: z.literal("pipeline"),
			title: z.string().min(1),
			task: caseRelativePathSchema,
			productBrief: caseRelativePathSchema,
			finalRubric: caseRelativePathSchema,
			pipeline: caseRelativePathSchema,
			rubrics: caseRelativePathSchema,
			target: z.object({ path: z.string().min(1) }).strict(),
			settingsFile: caseRelativePathSchema.optional(),
			model: declaredModelSchema,
			sessionBudgetUsd: declaredSessionBudgetUsdSchema,
		})
		.strict(),
	z
		.object({
			id: caseIdSchema,
			kind: z.literal("session"),
			title: z.string().min(1),
			fixture: caseRelativePathSchema.optional(),
			prompt: z.string().min(1),
			transcript: transcriptPrefixSchema.optional(),
			tools: z.array(z.string().min(1)),
			settings: jsonObjectSchema.optional(),
			agents: jsonObjectSchema.optional(),
			corpusFiles: z.array(z.string().min(1)),
			projectFiles: z.array(z.string().min(1)).default([]),
			checks: z.array(checkSchema).min(1),
			stateCheck: stateCheckSchema.optional(),
			model: declaredModelSchema,
			sessionBudgetUsd: declaredSessionBudgetUsdSchema,
		})
		.strict(),
]);

export type CaseDeclaration = Immutable<z.infer<typeof caseDeclarationSchema>>;

export type SessionCaseDeclaration = Extract<
	CaseDeclaration,
	{ readonly kind: "session" }
>;

export type PipelineCaseDeclaration = Extract<
	CaseDeclaration,
	{ readonly kind: "pipeline" }
>;

export interface LoadedStageRubric {
	readonly rubricPath: string;
	readonly content: string;
	readonly rubric: StageRubric;
}

export interface BenchmarkCase {
	readonly kind: "pipeline";
	readonly declaration: PipelineCaseDeclaration;
	readonly task: string;
	readonly productBrief: string;
	readonly finalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly pipelinePath: string;
	readonly pipeline: PipelineDefinition;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
	readonly targetPath: string;
	readonly settingsFilePath: string;
}

/**
 * Cases live in the control repository, and the tests that write a case must
 * not write into the one the suite is running from: a probe left behind by a
 * failure would then be listed by every later `case list`. The root is a
 * parameter so a test can own a directory of its own.
 */
export function casesRoot(): string {
	return join(CONTROL_DIR, CASES_DIRECTORY);
}

function caseDirectory(id: string, root: string = casesRoot()): string {
	return join(root, id);
}

/**
 * A declaration is untrusted data, so a path it names is confined to the one
 * directory that path's kind may reach before anything opens it. `resolve`
 * folds away `..` and absolute paths alike, so the containment is decided on
 * the resolved path rather than on the text the declaration carried.
 */
function confinedTo(directory: string, path: string, refusal: string): string {
	const absolute = resolve(directory, path);
	if (!absolute.startsWith(`${directory}/`)) {
		throw new CaseDeclarationError(refusal);
	}

	return absolute;
}

export function caseRelative(
	declaration: CaseDeclaration,
	path: string,
): string {
	return confinedTo(
		caseDirectory(declaration.id),
		path,
		`Case ${declaration.id} names a path outside its case directory: ${path}`,
	);
}

export function parseCaseDeclaration(
	id: string,
	text: string,
): CaseDeclaration {
	let document: unknown;
	try {
		document = JSON.parse(text);
	} catch (error) {
		throw new CaseDeclarationError(
			`Case ${id} declaration is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const parsed = caseDeclarationSchema.safeParse(document);
	if (!parsed.success) {
		const [issue] = parsed.error.issues;
		const field = issue?.path.join(".");

		throw new CaseDeclarationError(
			`Case ${id} declaration has an invalid ${field === undefined || field === "" ? "declaration" : field}: ${issue?.message ?? "invalid declaration"}`,
		);
	}
	if (parsed.data.id !== id) {
		throw new CaseDeclarationError(
			`Case declaration id ${parsed.data.id} does not match its directory name ${id}`,
		);
	}

	return parsed.data;
}

export function caseDeclarationPath(
	id: string,
	root: string = casesRoot(),
): string {
	return join(caseDirectory(id, root), "case.json");
}

export async function readCaseDeclaration(
	id: string,
	root: string = casesRoot(),
): Promise<CaseDeclaration> {
	if (!isCaseId(id)) {
		throw new CaseDeclarationError(
			`Unknown case ${id}: a case id is lowercase letters, digits, or dashes`,
		);
	}

	const path = caseDeclarationPath(id, root);
	let text: string;
	try {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			throw new CaseDeclarationError(
				`Unknown case ${id}: no declaration at ${relative(CONTROL_DIR, path)}`,
			);
		}
		text = await file.text();
	} catch (error) {
		if (error instanceof CaseDeclarationError) {
			throw error;
		}
		throw new CaseDeclarationError(
			`Cannot read case ${id} declaration at ${relative(CONTROL_DIR, path)}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return parseCaseDeclaration(id, text);
}

export interface UnreadableCase {
	readonly id: string;
	readonly reason: string;
}

export interface CaseListing {
	readonly declarations: readonly CaseDeclaration[];
	readonly unreadable: readonly UnreadableCase[];
}

async function readCaseDirectoryNames(): Promise<readonly string[]> {
	const directory = join(CONTROL_DIR, CASES_DIRECTORY);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		throw new CaseDeclarationError(
			`No case directory at ${relative(CONTROL_DIR, directory)}`,
		);
	}

	return entries
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => name)
		.toSorted((left, right) => left.localeCompare(right));
}

/**
 * A directory that holds no readable declaration is reported rather than
 * thrown, because a half-written case must not hide the cases that do read.
 */
export async function listCases(): Promise<CaseListing> {
	const declarations: CaseDeclaration[] = [];
	const unreadable: UnreadableCase[] = [];
	for (const id of await readCaseDirectoryNames()) {
		try {
			declarations.push(await readCaseDeclaration(id));
		} catch (error) {
			if (!(error instanceof CaseDeclarationError)) {
				throw error;
			}

			unreadable.push({ id, reason: error.message });
		}
	}

	return { declarations, unreadable };
}

export interface SessionCase {
	readonly kind: "session";
	readonly declaration: SessionCaseDeclaration;
	readonly fixturePath: string | undefined;
	readonly transcriptPath: string | undefined;
	readonly prompt: string;
	readonly tools: readonly string[];
	readonly settings: Immutable<JsonObject> | undefined;
	readonly agents: Immutable<JsonObject> | undefined;
	readonly corpusFiles: readonly string[];
	readonly projectFiles: readonly string[];
	readonly checks: Immutable<readonly Check[]>;
	readonly stateCheck?: Immutable<StateCheck> | undefined;
}

export type LoadedCase = BenchmarkCase | SessionCase;

export function requirePipelineCase(loaded: LoadedCase): BenchmarkCase {
	if (loaded.kind !== "pipeline") {
		throw new CaseDeclarationError(
			`Case ${loaded.declaration.id} is a session case; this command takes a pipeline case`,
		);
	}

	return loaded;
}

export function requireSessionCase(loaded: LoadedCase): SessionCase {
	if (loaded.kind !== "session") {
		throw new CaseDeclarationError(
			`Case ${loaded.declaration.id} is a pipeline case; this command takes a session case`,
		);
	}

	return loaded;
}

async function loadPipelineWithRubrics(
	declaration: PipelineCaseDeclaration,
	pipelinePath: string,
): Promise<{
	readonly pipeline: PipelineDefinition;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
}> {
	const pipeline = await loadPipeline(
		pipelinePath,
		relative(CONTROL_DIR, caseRelative(declaration, declaration.rubrics)),
	);
	const stageRubrics: Record<string, LoadedStageRubric> = {};
	for (const stage of pipeline.stages) {
		stageRubrics[stage.name] = await loadStageRubric(stage);
	}

	return { pipeline, stageRubrics };
}

/**
 * The target is the one declared path that may name a repository outside the
 * case directory, so it is resolved against that directory rather than confined
 * to it by `caseRelative`. The base is the case directory all the same: one
 * base for every path in a declaration.
 */
function declaredTarget(declaration: PipelineCaseDeclaration): string {
	const { path } = declaration.target;
	if (isAbsolute(path)) {
		return path;
	}

	return resolve(caseDirectory(declaration.id), path);
}

/**
 * The settings file is harness-owned data, not a copy of anything live, so a
 * case that names none gets the harness's own default rather than an absent
 * settings surface: every stage session has one to read. Exported so replay,
 * which reads a case declaration directly rather than loading a full
 * BenchmarkCase, resolves the same path a run would.
 */
export function declaredSettingsFilePath(
	declaration: PipelineCaseDeclaration,
): string {
	if (declaration.settingsFile === undefined) {
		return join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE);
	}

	return caseRelative(declaration, declaration.settingsFile);
}

/**
 * Every declared file this reads is untrusted data a case author can get
 * wrong, so a missing one is reported for the field that named it rather than
 * reaching the loader as a bare filesystem error with no fix a reader can act
 * on.
 */
async function readDeclaredFile(
	declaration: PipelineCaseDeclaration,
	field: string,
	relativePath: string,
): Promise<string> {
	const path = caseRelative(declaration, relativePath);
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new CaseDeclarationError(
			`Case ${declaration.id} declares ${field} at ${relativePath}, but no file is there; add it or correct the declaration`,
		);
	}

	return file.text();
}

async function loadPipelineCase(
	declaration: PipelineCaseDeclaration,
): Promise<BenchmarkCase> {
	const pipelinePath = relative(
		CONTROL_DIR,
		caseRelative(declaration, declaration.pipeline),
	);
	const [{ pipeline, stageRubrics }, task, productBrief, finalRubric] =
		await Promise.all([
			loadPipelineWithRubrics(declaration, pipelinePath),
			readDeclaredFile(declaration, "task", declaration.task),
			readDeclaredFile(declaration, "productBrief", declaration.productBrief),
			readDeclaredFile(declaration, "finalRubric", declaration.finalRubric),
		]);

	return {
		kind: "pipeline",
		declaration,
		task,
		productBrief,
		finalRubric,
		finalRubricPath: caseRelative(declaration, declaration.finalRubric),
		rubricsDirectory: caseRelative(declaration, declaration.rubrics),
		pipelinePath,
		pipeline,
		stageRubrics,
		targetPath: declaredTarget(declaration),
		settingsFilePath: declaredSettingsFilePath(declaration),
	};
}

export function transcriptPrefixPath(
	caseId: string,
	file: string,
	root: string = casesRoot(),
): string {
	return confinedTo(
		caseDirectory(caseId, root),
		file,
		`Case ${caseId} names a transcript outside its case directory: ${file}`,
	);
}

function loadSessionCase(declaration: SessionCaseDeclaration): SessionCase {
	const { fixture, transcript } = declaration;

	return {
		kind: "session",
		declaration,
		fixturePath:
			fixture === undefined ? undefined : caseRelative(declaration, fixture),
		transcriptPath:
			transcript === undefined
				? undefined
				: transcriptPrefixPath(declaration.id, transcript.file),
		prompt: declaration.prompt,
		tools: declaration.tools,
		settings: declaration.settings,
		agents: declaration.agents,
		corpusFiles: declaration.corpusFiles,
		projectFiles: declaration.projectFiles,
		checks: declaration.checks,
		stateCheck: declaration.stateCheck,
	};
}

export async function loadCase(id: string): Promise<LoadedCase> {
	const declaration = await readCaseDeclaration(id);
	if (declaration.kind === "session") {
		return loadSessionCase(declaration);
	}

	return loadPipelineCase(declaration);
}

/**
 * `--pipeline` replaces the pipeline the case declares, and with it the stage
 * rubrics its stages name, so the override produces a whole case rather than a
 * pipeline the rest of the case no longer matches.
 */
export async function withPipeline(
	benchmarkCase: BenchmarkCase,
	pipelinePath: string,
): Promise<BenchmarkCase> {
	const { pipeline, stageRubrics } = await loadPipelineWithRubrics(
		benchmarkCase.declaration,
		pipelinePath,
	);

	return { ...benchmarkCase, pipelinePath, pipeline, stageRubrics };
}
