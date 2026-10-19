import { z } from "zod";

import type { CheckpointRecord, StalenessLink } from "./checkpoint";
import { hashedFileSchema } from "./checkpoint";
import { effortSchema } from "./config";
import corpusMeasurementSchema from "./corpus-measurement";
import type { RunManifest } from "./manifest";
import { readManifestSchema } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";
import type { RunLocation } from "./run-layout";
import { stoppedStage } from "./run-outcome";

const FINAL_STAGE_CHECKPOINT_OFFSET = -1;

/** A link of a run's chain with the corpus version its stage measured. */
type JudgedLink = StalenessLink & Pick<CheckpointRecord, "corpusVersion">;

const stopRecordReadsSchema = z.object({
	corpusFiles: z.array(hashedFileSchema).optional(),
	corpusVersion: corpusMeasurementSchema.optional(),
	effort: effortSchema.optional(),
	model: z.string().nonempty().optional(),
	readManifest: readManifestSchema.optional(),
});

/**
 * The stage its judge stopped, judged as the link after the run's last
 * checkpoint from the reads its stop record keeps, since it saved no
 * checkpoint to judge. None when no stage stopped, when the stopped stage
 * has a checkpoint after all, or when its stop record predates stop records
 * keeping the corpus files a stage read, since judging no files would report
 * every file it read as added. It throws when a stage file or the reads it
 * keeps do not parse, which its caller reports without losing the run's
 * checkpoints. A
 * stop record written before it kept its model
 * or effort takes the run's. Stage settings are loaded once per run, so the
 * stopped stage ran under the settings file its run's checkpoints recorded.
 */
async function stoppedStageLink(
	{ runsDirectory, run }: RunLocation,
	manifest: RunManifest,
	checkpoints: readonly CheckpointRecord[],
): Promise<JudgedLink | undefined> {
	const stopped = await stoppedStage(runsDirectory, run);
	if (
		stopped === undefined ||
		checkpoints.some(({ stage }) => stage === stopped.stage)
	) {
		return undefined;
	}

	const stoppedStageFile = benchmarkRunPaths(runsDirectory, run).stageFile(
		stopped.stage,
	);
	const stoppedStageText = await Bun.file(stoppedStageFile).text();
	const reads = stopRecordReadsSchema.parse(JSON.parse(stoppedStageText));
	if (reads.corpusFiles === undefined) {
		return undefined;
	}

	return {
		corpusFiles: reads.corpusFiles,
		corpusVersion: reads.corpusVersion,
		effort: reads.effort ?? manifest.effort,
		model: reads.model ?? manifest.model,
		readManifest: reads.readManifest,
		settingsFile: checkpoints.at(FINAL_STAGE_CHECKPOINT_OFFSET)?.settingsFile,
		stage: stopped.stage,
	};
}

export { stopRecordReadsSchema, stoppedStageLink };

export type { JudgedLink };
