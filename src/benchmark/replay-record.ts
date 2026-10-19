import { z } from "zod";

import type { HashedFile } from "./checkpoint";
import { hashedFileSchema } from "./checkpoint";
import type { Effort } from "./config";
import { effortSchema } from "./config";
import type { StageScorecard } from "./contracts";
import { gradedHardBlockersSchema, stageLetterGradeSchema } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import corpusMeasurementSchema from "./corpus-measurement";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifestSchema } from "./read-manifest";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

interface ReplayRecord {
	readonly replay: true;
	readonly timestamp: string;
	readonly runName: string;
	readonly stage: string;
	readonly consumed: {
		readonly stage: string;
		readonly lineage: string;
		readonly targetSha: string;
	};
	readonly baseSha: string;
	readonly lineage: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly corpusVersion?: CorpusMeasurement | undefined;
	readonly settingsFile?: HashedFile | undefined;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd?: number | undefined;
	readonly controlSha: string;
	readonly stageCostUsd: number;
	readonly productOwnerCostUsd: number;
	readonly judgeCostUsd: number;
	readonly resultSha?: string | undefined;
	/** Whether the consumed chain still reflects the current corpus. */
	readonly stale: boolean;
	/** Per stale checkpoint, why: named corpus files, model, or effort. */
	readonly staleness: readonly {
		readonly stage: string;
		readonly causes: readonly string[];
	}[];
	readonly scorecard: StageScorecard;
	/** From the stage session's start to its judge's grade. */
	readonly elapsedMs?: number | undefined;
	/** What the replayed stage declared and loaded; older records lack it. */
	readonly readManifest?: readonly ReadManifestEntry[] | undefined;
}

const replayStalenessSchema = z
	.object({
		causes: z.array(z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS)),
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

const replayGradeSchema = z
	.object({
		grade: stageLetterGradeSchema,
		hardBlockers: gradedHardBlockersSchema.optional(),
		verdict: z.enum(["CONTINUE", "STOP"]),
	})
	.loose();

/**
 * The replay-specific envelope is strict; the scorecard inside it stays open
 * because its shape belongs to stage grading and is validated there.
 */
const replayRecordSchema = z
	.object({
		baseSha: z.string().nonempty(),
		consumed: z
			.object({
				lineage: z.string().nonempty(),
				stage: z.string().nonempty(),
				targetSha: z.string().nonempty(),
			})
			.strict(),
		controlSha: z.string().nonempty(),
		corpusFiles: z.array(hashedFileSchema),
		corpusVersion: corpusMeasurementSchema.optional(),
		effort: effortSchema.optional(),
		/** From the stage session's start to its judge's grade; older records lack it. */
		elapsedMs: z.number().nonnegative().optional(),
		judgeCostUsd: z.number().nonnegative(),
		judgeEffort: effortSchema.optional(),
		judgeModel: z.string().nonempty(),
		lineage: z.string().nonempty(),
		model: z.string().nonempty(),
		productOwnerCostUsd: z.number().nonnegative(),
		readManifest: readManifestSchema.optional(),
		replay: z.literal(true),
		resultSha: z.string().nonempty().optional(),
		runName: z.string().nonempty(),
		scorecard: z
			.object({
				costUsd: z.number(),
				grade: replayGradeSchema,
				stage: z.string().nonempty(),
			})
			.loose(),
		sessionBudgetUsd: z.number().positive(),
		settingsFile: hashedFileSchema.optional(),
		spendCeilingUsd: z.number().positive().optional(),
		stage: z.string().nonempty(),
		stageCostUsd: z.number().nonnegative(),
		stale: z.boolean().optional(),
		staleness: z.array(replayStalenessSchema).optional(),
		timestamp: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.strict();

type ParsedReplayRecord = z.infer<typeof replayRecordSchema>;

async function readReplayRecord(path: string): Promise<ParsedReplayRecord> {
	return replayRecordSchema.parse(JSON.parse(await Bun.file(path).text()));
}

export { replayRecordSchema, readReplayRecord };
export type { ReplayRecord, ParsedReplayRecord };
