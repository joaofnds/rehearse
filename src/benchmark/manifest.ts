import { z } from "zod";
import { effortSchema, LEGACY_CASE_ID } from "./config";
import { pipelineDefinitionSchema } from "./pipeline";
import type { TargetDefinition } from "./pipeline";
import { localCheckResultSchema } from "./contracts";
import type { Immutable } from "./contracts";

const LEGACY_TARGET_DEFINITION = {
	checks: [
		{
			command: ["bun", "run", "typecheck"],
			env: { CONFIG_PATH: "src/config/test.yaml" },
		},
		{
			command: ["bun", "run", "check"],
			env: { CONFIG_PATH: "src/config/test.yaml" },
		},
		{
			command: ["bun", "run", "test:unit"],
			env: { CONFIG_PATH: "src/config/test.yaml" },
		},
	],
	integrityFiles: ["package.json", "tsconfig.json", "biome.json"],
} satisfies TargetDefinition;

/**
 * Written when the run starts, not when it ends: a run that dies mid-pipeline
 * still leaves replay everything it needs to re-run a stage from the
 * checkpoints the run did record.
 */
const runManifestSchema = z
	.object({
		caseId: z.string().min(1).optional().default(LEGACY_CASE_ID),
		timestamp: z.string().min(1),
		controlSha: z.string().min(1),
		sourceRoot: z.string().min(1),
		sourceSha: z.string().min(1),
		taskId: z.string().min(1),
		taskSha: z.string().min(1),
		task: z.string().min(1),
		productBrief: z.string().min(1),
		model: z.string().min(1),
		effort: effortSchema.optional(),
		judgeModel: z.string().min(1),
		judgeEffort: effortSchema.optional(),
		sessionBudgetUsd: z.number().positive(),
		pipelinePath: z.string().min(1),
		pipeline: pipelineDefinitionSchema,
		baselineChecks: localCheckResultSchema.optional(),
	})
	.strict();

const legacyRunManifestSchema = runManifestSchema.extend({
	pipeline: pipelineDefinitionSchema.omit({ target: true }),
});

export type RunManifest = Immutable<z.infer<typeof runManifestSchema>>;

export async function writeRunManifest(
	path: string,
	manifest: RunManifest,
): Promise<void> {
	await Bun.write(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function loadRunManifest(path: string): Promise<RunManifest> {
	const file = Bun.file(path);

	if (!(await file.exists())) {
		throw new Error(
			`No run manifest at ${path}; runs recorded before manifests cannot be replayed`,
		);
	}

	return parseRunManifest(await file.text());
}

/**
 * The parse without the read, so a caller holding its own verified handle
 * does not reopen the path to hand it here.
 */
export function parseRunManifest(text: string): RunManifest {
	const document: unknown = JSON.parse(text);
	const current = runManifestSchema.safeParse(document);
	if (current.success) {
		return current.data;
	}

	const legacy = legacyRunManifestSchema.safeParse(document);
	if (!legacy.success) {
		return runManifestSchema.parse(document);
	}

	return runManifestSchema.parse({
		...legacy.data,
		pipeline: {
			...legacy.data.pipeline,
			target: LEGACY_TARGET_DEFINITION,
		},
	});
}
