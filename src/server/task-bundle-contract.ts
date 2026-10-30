import { z } from "zod";

import type { PipelineCaseDeclaration } from "#benchmark/case";
import { effortSchema } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import {
	pipelineDefinitionSchema,
	pipelineValidationOrder,
} from "#benchmark/pipeline";
import type { StageKind } from "#benchmark/pipeline";
import type { ValidationFieldOrder } from "#benchmark/validation-issue-order";

const writtenStageSchema = z.looseObject({ rubric: z.string() });

/** A pipeline file's top level as written, with no default filled in. */
const writtenPipelineSchema = z.looseObject({
	stages: z.array(writtenStageSchema),
});

const TASK_BUNDLE_FORMAT = "rehearse-task-bundle";

const RUBRIC_FILE = /^[a-z0-9][a-z0-9._-]*\.json$/iu;

const TASK_BUNDLE_VERSION = 1;

/**
 * A bundled step names its rubric by file name, since the rubric moves into
 * whichever case imports the bundle and a path would name the case it left.
 */
const rubricFileSchema = z
	.string()
	.regex(RUBRIC_FILE, "must be a rubric file name such as build.json");

/**
 * The pipeline is kept as written, so importing it adds no default the
 * parser fills in, and it is judged by the harness's own schema.
 */
const bundledPipelineSchema = writtenPipelineSchema.transform(
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

			return z.NEVER;
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

		return { definition: parsed.data, written: pipeline };
	},
);

/**
 * One pipeline case as a single file another checkout can import: its task,
 * its steps and every judge, the step rubrics and the final rubric. The
 * target path is the exporter's, so the importer names its own.
 */
const taskBundleSchema = z
	.object({
		/** The case it was exported from, which an import offers as its id. */
		caseId: z.string().nonempty(),
		effort: effortSchema.optional(),
		finalRubric: z.string().nonempty(),
		format: z.literal(TASK_BUNDLE_FORMAT),
		model: z.string().nonempty().optional(),
		pipeline: bundledPipelineSchema,
		productBrief: z.string().nonempty(),
		rubrics: z.record(rubricFileSchema, z.string().nonempty()),
		sessionBudgetUsd: z.number().positive().optional(),
		stageSettings: z.string().nonempty().optional(),
		target: z.object({ path: z.string().nonempty() }).strict(),
		task: z.string().nonempty(),
		title: z.string().nonempty(),
		version: z.literal(TASK_BUNDLE_VERSION),
	})
	.strict();

type ValidatedTaskBundle = Immutable<z.infer<typeof taskBundleSchema>>;

type TaskBundle = Omit<ValidatedTaskBundle, "pipeline"> & {
	readonly pipeline: Immutable<z.infer<typeof writtenPipelineSchema>>;
};

interface DeclaredTextReference {
	readonly field: string;
	readonly path: string;
}

/** A step as a bundle preview names it. */
interface PreviewedStep {
	readonly name: string;
	readonly kind: StageKind;
	readonly skill: string;
}

/** A container a bundle's target starts, as a bundle preview names it. */
interface PreviewedService {
	readonly name: string;
	readonly image: string;
	/** The variables it sets for setup, checks and stage sessions. */
	readonly exports: readonly string[];
}

/** What importing a bundle would declare, read before anything is written. */
interface TaskBundlePreview {
	readonly caseId: string;
	readonly title: string;
	readonly targetPath: string;
	readonly model: string | null;
	readonly steps: readonly PreviewedStep[];
	/** Each command the case runs in its target, as one line. */
	readonly commands: readonly string[];
	readonly services: readonly PreviewedService[];
	readonly stepJudges: number;
}

/** A bundle to import as a new case, under the id, title and target the importer names. */
interface TaskImport {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly bundle: ValidatedTaskBundle;
}

interface ImportedTask {
	readonly caseId: string;
	/** The new case's directory, control-relative, where its files are uncommitted. */
	readonly path: string;
}

/** A new pipeline case written from the operator's task, borrowing an existing case's steps and judges. */
interface PipelineCaseRequest {
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly task: string;
	readonly productBrief: string;
	/** The pipeline case whose steps, judges, model, effort and budget the new case starts from. */
	readonly from: string;
}

const taskBundleValidationOrder: ValidationFieldOrder = {
	children: {
		pipeline: pipelineValidationOrder,
		target: { fields: ["path"] },
	},
	fields: [
		"format",
		"version",
		"caseId",
		"title",
		"target",
		"model",
		"effort",
		"sessionBudgetUsd",
		"task",
		"productBrief",
		"finalRubric",
		"pipeline",
		"rubrics",
		"stageSettings",
	],
};

interface ImportedCaseWrite {
	readonly casesRoot: string;
	readonly declaration: PipelineCaseDeclaration;
	readonly request: Immutable<TaskImport>;
}

export {
	writtenPipelineSchema,
	TASK_BUNDLE_FORMAT,
	RUBRIC_FILE,
	taskBundleSchema,
	taskBundleValidationOrder,
};
export type {
	TaskBundle,
	ValidatedTaskBundle,
	DeclaredTextReference,
	PreviewedStep,
	PreviewedService,
	TaskBundlePreview,
	TaskImport,
	ImportedTask,
	PipelineCaseRequest,
	ImportedCaseWrite,
};
