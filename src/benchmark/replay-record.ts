import { z } from "zod";
import type { HashedFile } from "./checkpoint";
import { hashedFileSchema } from "./checkpoint";
import type { Effort } from "./config";
import { effortSchema } from "./config";
import type { StageScorecard } from "./contracts";
import { stageLetterGradeSchema } from "./contracts";

export interface ReplayRecord {
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
	readonly settingsFile?: HashedFile | undefined;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
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
}

/**
 * The replay-specific envelope is strict; the scorecard inside it stays open
 * because its shape belongs to stage grading and is validated there.
 */
export const replayRecordSchema = z
	.object({
		replay: z.literal(true),
		timestamp: z.string().min(1),
		runName: z.string().min(1),
		stage: z.string().min(1),
		consumed: z
			.object({
				stage: z.string().min(1),
				lineage: z.string().min(1),
				targetSha: z.string().min(1),
			})
			.strict(),
		baseSha: z.string().min(1),
		lineage: z.string().min(1),
		corpusFiles: z.array(hashedFileSchema),
		settingsFile: hashedFileSchema.optional(),
		model: z.string().min(1),
		effort: effortSchema.optional(),
		judgeModel: z.string().min(1),
		judgeEffort: effortSchema.optional(),
		sessionBudgetUsd: z.number().positive(),
		controlSha: z.string().min(1),
		stageCostUsd: z.number().nonnegative(),
		productOwnerCostUsd: z.number().nonnegative(),
		judgeCostUsd: z.number().nonnegative(),
		resultSha: z.string().min(1).optional(),
		stale: z.boolean().optional(),
		staleness: z
			.array(
				z
					.object({
						stage: z.string().min(1),
						causes: z.array(z.string().min(1)),
					})
					.strict(),
			)
			.optional(),
		scorecard: z
			.object({
				stage: z.string().min(1),
				costUsd: z.number(),
				grade: z
					.object({
						grade: stageLetterGradeSchema,
						verdict: z.enum(["CONTINUE", "STOP"]),
					})
					.loose(),
			})
			.loose(),
		/** From the stage session's start to its judge's grade; older records lack it. */
		elapsedMs: z.number().nonnegative().optional(),
	})
	.strict();

export async function readReplayRecord(
	path: string,
): Promise<z.infer<typeof replayRecordSchema>> {
	return replayRecordSchema.parse(JSON.parse(await Bun.file(path).text()));
}
