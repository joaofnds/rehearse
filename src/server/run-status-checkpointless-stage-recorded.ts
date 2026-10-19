import { z } from "zod";

import {
	recordFileExists,
	scopedRecordParser,
} from "#benchmark/record-read-scope";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import {
	awaitingJudgeStageRecordSchema,
	stoppedStageRecordSchema,
} from "#benchmark/run-outcome";

const readCheckpointlessStageRecord = scopedRecordParser(
	z.union([stoppedStageRecordSchema, awaitingJudgeStageRecordSchema]),
);

/**
 * Whether a stage's own record file is one the stage page renders without a
 * checkpoint: a stop record, or a record left awaiting judgment, naming this
 * stage.
 */
async function checkpointlessStageRecorded(
	paths: BenchmarkRunPaths,
	stage: string,
): Promise<boolean> {
	const file = paths.stageFile(stage);
	if (!(await recordFileExists(file))) {
		return false;
	}

	const parsed = await readCheckpointlessStageRecord(file);

	return parsed.data?.stage === stage;
}

export { checkpointlessStageRecorded as default };
