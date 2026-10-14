import { mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { z } from "zod";
import {
	CASES_DIRECTORY,
	CaseDeclarationError,
	caseDeclarationPath,
	caseRelative,
	parseCaseDeclaration,
} from "#benchmark/case";
import type { PipelineCaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import {
	PipelineDefinitionError,
	pipelineDefinitionSchema,
} from "#benchmark/pipeline";
import type { StageKind } from "#benchmark/pipeline";
import { stageSettingsSchema } from "#benchmark/stage-settings";
import { git } from "#benchmark/target";
import {
	PipelineCaseRefusalError,
	pipelineCase,
	refusingAs,
} from "./pipeline-steps";
import { checkedPipeline, readDeclaredPipeline } from "./pipelines";
import { projectFormatted } from "./project-format";
import { redactAbsolutePaths } from "./redact-path";

export const TASK_BUNDLE_FORMAT = "rehearse-task-bundle";

const RUBRIC_FILE = /^[a-z0-9][a-z0-9._-]*\.json$/iu;

/**
 * A bundled step names its rubric by file name, since the rubric moves into
 * whichever case imports the bundle and a path would name the case it left.
 */
const rubricFileSchema = z
	.string()
	.regex(RUBRIC_FILE, "must be a rubric file name such as build.json");

/** A pipeline file's top level as written, with no default filled in. */
const writtenPipelineSchema = z.looseObject({
	stages: z.array(z.looseObject({ rubric: z.string() })),
});

/**
 * The pipeline is kept as written, so importing it adds no default the
 * parser fills in, and it is judged by the harness's own schema.
 */
const bundledPipelineSchema = writtenPipelineSchema.superRefine(
	(pipeline, context) => {
		const parsed = pipelineDefinitionSchema.safeParse(pipeline);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				context.addIssue({
					code: "custom",
					message: issue.message,
					path: issue.path,
				});
			}

			return;
		}
		for (const [index, stage] of parsed.data.stages.entries()) {
			if (!RUBRIC_FILE.test(stage.rubric)) {
				context.addIssue({
					code: "custom",
					message: "must be a rubric file name such as build.json",
					path: ["stages", index, "rubric"],
				});
			}
		}
	},
);

/**
 * One pipeline case as a single file another checkout can import: its task,
 * its steps and every judge, the step rubrics and the final rubric. The
 * target path is the exporter's, so the importer names its own.
 */
export const taskBundleSchema = z
	.object({
		format: z.literal(TASK_BUNDLE_FORMAT),
		version: z.literal(1),
		/** The case it was exported from, which an import offers as its id. */
		caseId: z.string().min(1),
		title: z.string().min(1),
		target: z.object({ path: z.string().min(1) }).strict(),
		model: z.string().min(1).optional(),
		sessionBudgetUsd: z.number().positive().optional(),
		task: z.string().min(1),
		productBrief: z.string().min(1),
		finalRubric: z.string().min(1),
		pipeline: bundledPipelineSchema,
		rubrics: z.record(rubricFileSchema, z.string().min(1)),
		stageSettings: z.string().min(1).optional(),
	})
	.strict();

export type TaskBundle = z.infer<typeof taskBundleSchema>;

/** The files an imported case is written as, relative to its directory. */
const IMPORTED_FILES = {
	task: "task.md",
	productBrief: "product-brief.md",
	finalRubric: "rubric.md",
	pipeline: "pipeline.json",
	rubrics: "rubrics",
	stageSettings: "stage-settings.json",
} as const;

async function declaredText(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	field: string,
	path: string,
): Promise<string> {
	const file = Bun.file(caseRelative(declaration, path, casesRoot));
	if (!(await file.exists())) {
		throw new PipelineCaseRefusalError(
			`Case ${declaration.id} declares ${field} at ${path}, but no file is there`,
			409,
		);
	}

	return file.text();
}

async function bundledRubrics(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
): Promise<Record<string, string>> {
	const directory = caseRelative(declaration, declaration.rubrics, casesRoot);
	const rubrics: Record<string, string> = {};
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isFile() && RUBRIC_FILE.test(entry.name)) {
			rubrics[entry.name] = await Bun.file(join(directory, entry.name)).text();
		}
	}

	return rubrics;
}

/** Reads a pipeline case into a bundle, refusing one the harness would refuse to run. */
export async function exportTaskBundle(
	casesRoot: string,
	caseId: string,
): Promise<TaskBundle> {
	const declaration = await pipelineCase(casesRoot, caseId);
	await refusingAs(409, () => readDeclaredPipeline(casesRoot, declaration));
	const written = writtenPipelineSchema.parse(
		JSON.parse(
			await declaredText(
				casesRoot,
				declaration,
				"pipeline",
				declaration.pipeline,
			),
		),
	);

	// The parse made these objects, so naming each rubric by file name in place
	// changes nothing the case reads.
	for (const stage of written.stages) {
		stage.rubric = basename(stage.rubric);
	}

	return {
		format: TASK_BUNDLE_FORMAT,
		version: 1,
		caseId,
		title: declaration.title,
		target: { path: declaration.target.path },
		model: declaration.model,
		sessionBudgetUsd: declaration.sessionBudgetUsd,
		task: await declaredText(casesRoot, declaration, "task", declaration.task),
		productBrief: await declaredText(
			casesRoot,
			declaration,
			"productBrief",
			declaration.productBrief,
		),
		finalRubric: await declaredText(
			casesRoot,
			declaration,
			"finalRubric",
			declaration.finalRubric,
		),
		pipeline: written,
		rubrics: await bundledRubrics(casesRoot, declaration),
		stageSettings:
			declaration.settingsFile === undefined
				? undefined
				: await declaredText(
						casesRoot,
						declaration,
						"settingsFile",
						declaration.settingsFile,
					),
	};
}

/** A step as a bundle preview names it. */
export interface PreviewedStep {
	readonly name: string;
	readonly kind: StageKind;
	readonly skill: string;
}

/** What importing a bundle would declare, read before anything is written. */
export interface TaskBundlePreview {
	readonly caseId: string;
	readonly title: string;
	readonly targetPath: string;
	readonly model: string | null;
	readonly steps: readonly PreviewedStep[];
	/** Each command the case runs in its target, as one line. */
	readonly commands: readonly string[];
	readonly stepJudges: number;
}

export function previewTaskBundle(
	bundle: Immutable<TaskBundle>,
): TaskBundlePreview {
	const pipeline = pipelineDefinitionSchema.parse(bundle.pipeline);

	return {
		caseId: bundle.caseId,
		title: bundle.title,
		targetPath: bundle.target.path,
		model: bundle.model ?? null,
		steps: pipeline.stages.map(({ name, kind, skill }) => ({
			name,
			kind,
			skill,
		})),
		commands: [...(pipeline.target.setup ?? []), ...pipeline.target.checks].map(
			({ command }) => command.join(" "),
		),
		stepJudges: new Set(pipeline.stages.map(({ rubric }) => rubric)).size,
	};
}

/** A bundle to import as a new case, under the id, title and target the importer names. */
export interface TaskImport {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly bundle: TaskBundle;
}

export interface ImportedTask {
	readonly caseId: string;
	/** The new case's directory, control-relative, where its files are uncommitted. */
	readonly path: string;
}

function importedDeclaration(
	request: Immutable<TaskImport>,
): PipelineCaseDeclaration {
	const { bundle } = request;
	const text = JSON.stringify({
		id: request.id,
		kind: "pipeline",
		title: request.title,
		task: IMPORTED_FILES.task,
		productBrief: IMPORTED_FILES.productBrief,
		finalRubric: IMPORTED_FILES.finalRubric,
		pipeline: IMPORTED_FILES.pipeline,
		rubrics: IMPORTED_FILES.rubrics,
		target: { path: request.targetPath },
		settingsFile:
			bundle.stageSettings === undefined
				? undefined
				: IMPORTED_FILES.stageSettings,
		model: bundle.model,
		sessionBudgetUsd: bundle.sessionBudgetUsd,
	});
	let declaration;
	try {
		declaration = parseCaseDeclaration(request.id, text);
	} catch (error) {
		if (!(error instanceof CaseDeclarationError)) {
			throw error;
		}

		throw new PipelineCaseRefusalError(error.message, 400);
	}
	if (declaration.kind !== "pipeline") {
		throw new PipelineCaseRefusalError(
			`Case ${request.id} did not declare as a pipeline case`,
			400,
		);
	}

	return declaration;
}

/**
 * A run refuses a target that is not a repository root, or is this control
 * repository, so the declaration is refused for them now rather than at the
 * first launch. Its branch and cleanliness are a run's own checks, since they
 * change between runs.
 */
async function refuseTarget(
	caseDirectory: string,
	targetPath: string,
): Promise<void> {
	const named = isAbsolute(targetPath)
		? targetPath
		: resolve(caseDirectory, targetPath);
	let root;
	try {
		root = await realpath(named);
	} catch {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} is not a directory on this machine`,
			400,
		);
	}
	let repositoryRoot;
	try {
		repositoryRoot = await realpath(
			await git(root, "rev-parse", "--show-toplevel"),
		);
	} catch {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} is not a git repository`,
			400,
		);
	}
	if (repositoryRoot !== root) {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} must be its repository's root`,
			400,
		);
	}
	if (root === (await realpath(CONTROL_DIR))) {
		throw new PipelineCaseRefusalError(
			`Target ${targetPath} is this control repository, which a run may not change`,
			400,
		);
	}
}

function refuseStageSettings(stageSettings: string | undefined): void {
	if (stageSettings === undefined) {
		return;
	}
	let document: unknown;
	try {
		document = JSON.parse(stageSettings);
	} catch {
		throw new PipelineCaseRefusalError(
			"The bundle's stage settings are not valid JSON",
			400,
		);
	}
	const parsed = stageSettingsSchema.safeParse(document);
	if (!parsed.success) {
		throw new PipelineCaseRefusalError(
			`The bundle's stage settings are refused: ${z.prettifyError(parsed.error)}`,
			400,
		);
	}
}

/**
 * Made without `recursive`, so an id already on disk, declared or left
 * half-written, is refused, and of two imports racing for one id only the
 * first makes it.
 */
async function claimCaseDirectory(
	directory: string,
	id: string,
): Promise<void> {
	try {
		await mkdir(directory);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "EEXIST")
		) {
			throw error;
		}
		throw new PipelineCaseRefusalError(
			`Case ${id} already has a directory under ${CASES_DIRECTORY}/`,
			409,
		);
	}
}

async function writeFormatted(file: string, text: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, await projectFormatted(file, text));
}

async function writeImportedFiles(
	casesRoot: string,
	declaration: PipelineCaseDeclaration,
	bundle: Immutable<TaskBundle>,
): Promise<string> {
	const directory = dirname(caseDeclarationPath(declaration.id, casesRoot));
	const at = (path: string): string => join(directory, path);
	const written = writtenPipelineSchema.parse(bundle.pipeline);
	for (const stage of written.stages) {
		// Control-relative, as a step names a rubric of its own case.
		stage.rubric = relative(
			CONTROL_DIR,
			caseRelative(declaration, join(IMPORTED_FILES.rubrics, stage.rubric)),
		);
	}
	const pipelineText = JSON.stringify(written, null, "\t");

	await writeFormatted(
		caseDeclarationPath(declaration.id, casesRoot),
		JSON.stringify(declaration, null, "\t"),
	);
	await writeFormatted(at(IMPORTED_FILES.task), bundle.task);
	await writeFormatted(at(IMPORTED_FILES.productBrief), bundle.productBrief);
	await writeFormatted(at(IMPORTED_FILES.finalRubric), bundle.finalRubric);
	for (const [name, rubric] of Object.entries(bundle.rubrics)) {
		await writeFormatted(at(join(IMPORTED_FILES.rubrics, name)), rubric);
	}
	if (bundle.stageSettings !== undefined) {
		await writeFormatted(
			at(IMPORTED_FILES.stageSettings),
			bundle.stageSettings,
		);
	}
	await writeFormatted(at(IMPORTED_FILES.pipeline), pipelineText);

	return directory;
}

/**
 * Declares a new pipeline case from a bundle. Everything a run reads is
 * checked before the case directory is claimed, except the pipeline, whose
 * rubrics must be on disk to be checked, so a pipeline the harness refuses
 * removes the directory it was written into.
 */
export async function importTaskBundle(
	casesRoot: string,
	request: Immutable<TaskImport>,
): Promise<ImportedTask> {
	const declaration = importedDeclaration(request);
	const caseDirectory = dirname(caseDeclarationPath(request.id, casesRoot));
	await refuseTarget(caseDirectory, request.targetPath);
	refuseStageSettings(request.bundle.stageSettings);

	await claimCaseDirectory(caseDirectory, request.id);
	try {
		await writeImportedFiles(casesRoot, declaration, request.bundle);
		await checkedPipeline(
			casesRoot,
			declaration,
			await Bun.file(join(caseDirectory, IMPORTED_FILES.pipeline)).text(),
		);
	} catch (error) {
		await rm(caseDirectory, { force: true, recursive: true });
		if (error instanceof PipelineDefinitionError) {
			throw new PipelineCaseRefusalError(
				redactAbsolutePaths(error.message),
				400,
			);
		}

		throw error;
	}

	return {
		caseId: request.id,
		path: join(CASES_DIRECTORY, request.id),
	};
}

/** A new pipeline case written from the operator's task, borrowing an existing case's steps and judges. */
export interface PipelineCaseRequest {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly task: string;
	readonly productBrief: string;
	/** The pipeline case whose steps, judges, model and budget the new case starts from. */
	readonly from: string;
}

export async function declarePipelineCase(
	casesRoot: string,
	request: Immutable<PipelineCaseRequest>,
): Promise<ImportedTask> {
	const bundle = await exportTaskBundle(casesRoot, request.from);

	return importTaskBundle(casesRoot, {
		id: request.id,
		title: request.title,
		targetPath: request.targetPath,
		bundle: {
			...bundle,
			task: request.task,
			productBrief: request.productBrief,
		},
	});
}
