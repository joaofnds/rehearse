import { z } from "zod";

import { hashedFileSchema } from "./checkpoint-lineage";
import type { HashedFile } from "./checkpoint-lineage";
import type { Effort } from "./config";
import { effortSchema } from "./config";
import type { Immutable } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import corpusMeasurementSchema from "./corpus-measurement";
import { readManifestSchema } from "./read-manifest";
import type { ReadManifestEntry } from "./read-manifest";
import { parseRecord } from "./record-parse-cache";
import { stageTranscriptEvidenceSchema } from "./stage-transcript-evidence";
import type { StageTranscriptSource } from "./stage-transcript-evidence";

const checkpointRecordSchema = z
	.object({
		artifacts: z.array(hashedFileSchema),
		corpusFiles: z.array(hashedFileSchema),
		corpusVersion: corpusMeasurementSchema.optional(),
		effort: effortSchema.optional(),
		lineage: z.string().nonempty(),
		model: z.string().nonempty(),
		readManifest: readManifestSchema.optional(),
		settingsFile: hashedFileSchema.optional(),
		stage: z.string().nonempty(),
		targetSha: z.string().nonempty(),
		transcript: stageTranscriptEvidenceSchema.optional(),
		upstream: z.string().nonempty(),
		workflowState: z.array(hashedFileSchema),
	})
	.strict();

type CheckpointRecord = Immutable<z.infer<typeof checkpointRecordSchema>>;

function parseCheckpointRecord(text: string): CheckpointRecord {
	return parseRecord(checkpointRecordSchema, text);
}

interface CheckpointInputs {
	readonly stage: string;
	readonly targetSha: string;
	readonly upstream: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly corpusFiles: readonly HashedFile[];
	readonly artifacts: readonly HashedFile[];
	readonly settingsFile?: HashedFile | undefined;
	readonly transcript?: StageTranscriptSource | undefined;
	readonly corpusVersion?: CorpusMeasurement | undefined;
	readonly readManifest?: readonly ReadManifestEntry[] | undefined;
}
export { parseCheckpointRecord as default };
export type { CheckpointRecord, CheckpointInputs };
