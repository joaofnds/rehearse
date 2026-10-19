import { z } from "zod";

import { hashedFileSchema, readCheckpointRecord } from "#benchmark/checkpoint";
import type { CheckpointRecord } from "#benchmark/checkpoint";
import {
	claudeCallMetricsSchema,
	gradedHardBlockersSchema,
} from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import corpusMeasurementSchema from "#benchmark/corpus-measurement";
import { readManifestSchema } from "#benchmark/read-manifest";
import { parseRecord } from "#benchmark/record-parse-cache";
import { recordFileExists, recordFileText } from "#benchmark/record-read-scope";
import { checkpointRecordFile } from "#benchmark/run-layout";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";

/** Stands for a call count a record keeps in place of the calls. */
const COUNTED_CALLS = "counted" as const;

const callsSchema = z.array(
	z.object({ metrics: claudeCallMetricsSchema.optional() }).loose(),
);

const recordedTranscriptSchema = z
	.object({
		costUsd: z.number().optional(),
		/** A count, not a list, in the oldest awaiting-judgment records. */
		providerCalls: z
			.union([callsSchema, z.number().transform(() => COUNTED_CALLS)])
			.optional(),
	})
	.loose();

const recordedInputSchema = z
	.object({
		changedPaths: z.array(z.string()).optional(),
		commitSubjects: z.array(z.string()).optional(),
		transcript: recordedTranscriptSchema.optional(),
	})
	.loose();

const stageFileSchema = z
	.object({
		attempts: callsSchema.optional(),
		corpusFiles: z.array(hashedFileSchema).optional(),
		corpusVersion: corpusMeasurementSchema.optional(),
		costUsd: z.number().optional(),
		elapsedMs: z.number().optional(),
		grade: z
			.object({
				grade: z.string(),
				hardBlockers: gradedHardBlockersSchema.optional(),
				verdict: z.string(),
			})
			.loose()
			.optional(),
		hardBlockers: gradedHardBlockersSchema.optional(),
		input: recordedInputSchema.optional(),
		/** Every call a failed Judge paid for, a halted one included. */
		judgeProviderCalls: callsSchema.optional(),
		productOwnerCostUsd: z.number().optional(),
		productOwnerProviderCalls: callsSchema.optional(),
		readManifest: readManifestSchema.optional(),
		/** A stop record's run-wide readings, up to the stop. */
		runElapsedMs: z.number().optional(),
		/** A ceiling stop's session up to the stop, when no Judge ran to hold it. */
		session: z
			.object({
				costUsd: z.number().optional(),
				providerCalls: callsSchema,
			})
			.optional(),
		status: z.string().optional(),
	})
	.loose();

type StageFile = Immutable<z.infer<typeof stageFileSchema>>;

const gradedArtifactSchema = z
	.object({ grade: z.object({ verdict: z.enum(["PASS", "FAIL"]) }).loose() })
	.loose();

const artifactSpendSchema = z
	.object({
		elapsedMs: z.number().optional(),
		judgeAttempts: callsSchema.optional(),
		judgeCostUsd: z.number().optional(),
		/** Every call a failed final Judge paid for, a halted one included. */
		judgeProviderCalls: callsSchema.optional(),
		productOwnerCostUsd: z.number().optional(),
		productOwnerProviderCalls: callsSchema.optional(),
	})
	.loose();

type ArtifactSpend = Immutable<z.infer<typeof artifactSpendSchema>>;

/**
 * What a main artifact carries in place of a grade when the final judge
 * never returned one.
 */
const failedJudgeArtifactSchema = z
	.object({ failure: z.string().nonempty() })
	.loose();

async function readStageFile(
	paths: Pick<BenchmarkRunPaths, "stageFile">,
	stage: string,
): Promise<StageFile | undefined> {
	const file = paths.stageFile(stage);
	if (!(await recordFileExists(file))) {
		return undefined;
	}

	return parseRecord(stageFileSchema, await recordFileText(file));
}

async function readCheckpoint(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<CheckpointRecord | undefined> {
	const directory = paths.checkpointDirectory(stage);
	if (!(await Bun.file(checkpointRecordFile(directory)).exists())) {
		return undefined;
	}

	return await readCheckpointRecord(directory);
}

export {
	COUNTED_CALLS,
	callsSchema,
	gradedArtifactSchema,
	artifactSpendSchema,
	failedJudgeArtifactSchema,
	readStageFile,
	readCheckpoint,
};
export type { StageFile, ArtifactSpend };
