import { z } from "zod";

import { scopedRecordParser } from "./record-read-scope";
import { runStageFiles } from "./run-layout";
import serialMap from "./serial-map";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

/**
 * What makes a stage file a stop record. It stays this narrow because every
 * reader keys on it: a record carrying a field one reader cannot parse is
 * still a stop record, and widening this would stop the run appearing as
 * stopped anywhere rather than costing that one reader its one field.
 */
const stoppedStageRecordSchema = z
	.object({
		error: z.string().nonempty(),
		stage: z.string().nonempty(),
		status: z.literal("STAGE_JUDGE_FAILED"),
	})
	.loose();

/**
 * What makes a stage file a record whose judging never completed. The harness
 * writes it before judging starts and overwrites the same file when judging
 * ends, so a file still carrying it is a stage whose run died in that window.
 * It stays as narrow as its sibling above and for the same reason.
 */
const awaitingJudgeStageRecordSchema = z
	.object({
		stage: z.string().nonempty(),
		status: z.literal("AWAITING_STAGE_JUDGE"),
	})
	.loose();

const readStoppedStageRecord = scopedRecordParser(stoppedStageRecordSchema);
const readAwaitingJudgeStageRecord = scopedRecordParser(
	awaitingJudgeStageRecordSchema,
);

const recordedCorpusFileSchema = z.object({
	path: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	sha256: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
});

/**
 * The stage's own recorded identity, beside whichever state its record rests
 * in. Both fields are optional because a record written before the harness
 * wrote them carries neither, and a record that fails this parse loses both
 * together: the reader falls back to the run manifest for the whole of it.
 */
const stageRecordDetailSchema = z.object({
	corpusFiles: z.array(recordedCorpusFileSchema).optional(),
	model: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS).optional(),
});

interface StoppedStage {
	readonly stage: string;
	readonly error: string;
}

/** The first of a run's stage files that parses as the given record. */
async function firstStageRecord<Record>(
	runsDirectory: string,
	run: string,
	read: (path: string) => Promise<z.ZodSafeParseResult<Record>>,
): Promise<Record | undefined> {
	const files = await runStageFiles(runsDirectory, run);
	for await (const parsed of serialMap(files.values(), read)) {
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
async function stoppedStage(
	runsDirectory: string,
	run: string,
): Promise<StoppedStage | undefined> {
	const record = await firstStageRecord(
		runsDirectory,
		run,
		readStoppedStageRecord,
	);

	return record === undefined
		? undefined
		: { error: record.error, stage: record.stage };
}

/**
 * The stage a run left awaiting its judge, or undefined when no stage file
 * still carries `status: AWAITING_STAGE_JUDGE`.
 */
async function awaitingJudgeStage(
	runsDirectory: string,
	run: string,
): Promise<string | undefined> {
	const record = await firstStageRecord(
		runsDirectory,
		run,
		readAwaitingJudgeStageRecord,
	);

	return record?.stage;
}

export {
	stoppedStageRecordSchema,
	awaitingJudgeStageRecordSchema,
	stageRecordDetailSchema,
	stoppedStage,
	awaitingJudgeStage,
};
export type { StoppedStage };
