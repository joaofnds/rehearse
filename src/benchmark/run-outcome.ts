import { z } from "zod";
import { runStageFiles } from "./run-layout";

/**
 * What makes a stage file a stop record. It stays this narrow because every
 * reader keys on it: a record carrying a field one reader cannot parse is
 * still a stop record, and widening this would stop the run appearing as
 * stopped anywhere rather than costing that one reader its one field.
 */
export const stoppedStageRecordSchema = z
	.object({
		status: z.literal("STAGE_JUDGE_FAILED"),
		stage: z.string().min(1),
		error: z.string().min(1),
	})
	.loose();

/**
 * What makes a stage file a record whose judging never completed. The harness
 * writes it before judging starts and overwrites the same file when judging
 * ends, so a file still carrying it is a stage whose run died in that window.
 * It stays as narrow as its sibling above and for the same reason.
 */
export const awaitingJudgeStageRecordSchema = z
	.object({
		status: z.literal("AWAITING_STAGE_JUDGE"),
		stage: z.string().min(1),
	})
	.loose();

/**
 * The stage's own recorded identity, beside whichever state its record rests
 * in. Both fields are optional because a record written before the harness
 * wrote them carries neither, and a record that fails this parse loses both
 * together: the reader falls back to the run manifest for the whole of it.
 */
export const stageRecordDetailSchema = z.object({
	corpusFiles: z
		.array(z.object({ path: z.string().min(1), sha256: z.string().min(1) }))
		.optional(),
	model: z.string().min(1).optional(),
});

export interface StoppedStage {
	readonly stage: string;
	readonly error: string;
}

/** The first of a run's stage files that parses as the given record. */
async function firstStageRecord<Record>(
	runsDirectory: string,
	run: string,
	schema: z.ZodType<Record>,
): Promise<Record | undefined> {
	for (const file of await runStageFiles(runsDirectory, run)) {
		const parsed = schema.safeParse(JSON.parse(await Bun.file(file).text()));
		if (parsed.success) {
			return parsed.data;
		}
	}

	return undefined;
}

/**
 * A stage that stops the run overwrites its own `<run>.<stage>.json` with a
 * stop record instead of a judged scorecard, so among a run's stage files at
 * most one carries `status: STAGE_JUDGE_FAILED`. A run that never stopped, or
 * that stopped before any stage wrote a file at all, has none.
 */
export async function stoppedStage(
	runsDirectory: string,
	run: string,
): Promise<StoppedStage | undefined> {
	const record = await firstStageRecord(
		runsDirectory,
		run,
		stoppedStageRecordSchema,
	);

	return record === undefined
		? undefined
		: { stage: record.stage, error: record.error };
}

/**
 * The stage a run left awaiting its judge, or undefined when no stage file
 * still carries `status: AWAITING_STAGE_JUDGE`.
 */
export async function awaitingJudgeStage(
	runsDirectory: string,
	run: string,
): Promise<string | undefined> {
	const record = await firstStageRecord(
		runsDirectory,
		run,
		awaitingJudgeStageRecordSchema,
	);

	return record?.stage;
}
