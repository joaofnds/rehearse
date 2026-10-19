import { z } from "zod";

import { LEGACY_CASE_ID, effortSchema } from "./config";
import { localCheckResultSchema, stageLetterGradeSchema } from "./contracts";
import type { Immutable } from "./contracts";
import corpusMeasurementSchema from "./corpus-measurement";
import { pipelineDefinitionSchema } from "./pipeline";
import type { TargetDefinition } from "./pipeline";
import { parseRecord } from "./record-parse-cache";
import { scopedRecordReader } from "./record-read-scope";

const RECORD_JSON_INDENT_SPACES = 2;

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
		baselineChecks: localCheckResultSchema.optional(),
		caseId: z.string().nonempty().optional().default(LEGACY_CASE_ID),
		controlSha: z.string().nonempty(),
		corpusVersion: corpusMeasurementSchema.optional(),
		effort: effortSchema.optional(),
		judgeEffort: effortSchema.optional(),
		judgeModel: z.string().nonempty(),
		minimumGrade: stageLetterGradeSchema.optional(),
		model: z.string().nonempty(),
		pipeline: pipelineDefinitionSchema,
		pipelinePath: z.string().nonempty(),
		productBrief: z.string().nonempty(),
		sessionBudgetUsd: z.number().positive(),
		sourceRoot: z.string().nonempty(),
		sourceSha: z.string().nonempty(),
		spendCeilingUsd: z.number().positive().optional(),
		targetRoot: z.string().nonempty().optional(),
		task: z.string().nonempty(),
		taskId: z.string().nonempty(),
		taskSha: z.string().nonempty(),
		timestamp: z.string().nonempty(),
	})
	.strict();

const legacyRunManifestSchema = runManifestSchema.extend({
	pipeline: pipelineDefinitionSchema.omit({ target: true }),
});

type RunManifest = Immutable<z.infer<typeof runManifestSchema>>;

class MissingRunManifestError extends Error {
	public constructor(public readonly path: string) {
		super(
			`No run manifest at ${path}; runs recorded before manifests cannot be replayed`,
		);
		this.name = "MissingRunManifestError";
	}
}

async function writeRunManifest(
	path: string,
	manifest: RunManifest,
): Promise<void> {
	await Bun.write(
		path,
		`${JSON.stringify(manifest, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

const loadRunManifest = scopedRecordReader(
	async (path): Promise<RunManifest> => {
		const file = Bun.file(path);

		if (!(await file.exists())) {
			throw new MissingRunManifestError(path);
		}

		return parseRunManifest(await file.text());
	},
);

/**
 * The parse without the read, so a caller holding its own verified handle
 * does not reopen the path to hand it here.
 */
const readableRunManifestSchema = z.union([
	runManifestSchema,
	legacyRunManifestSchema.transform((legacy) =>
		runManifestSchema.parse({
			...legacy,
			pipeline: { ...legacy.pipeline, target: LEGACY_TARGET_DEFINITION },
		}),
	),
]);

function parseRunManifest(text: string): RunManifest {
	return parseRecord(readableRunManifestSchema, text);
}

export {
	MissingRunManifestError,
	writeRunManifest,
	loadRunManifest,
	parseRunManifest,
};
export type { RunManifest };
