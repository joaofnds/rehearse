import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readShortIds,
} from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { shortIdsOf } from "#cli/short-id-column";
import { redactAbsolutePaths } from "#server/redact-path";
import type {
	RecordedStage,
	ShortIdReading,
} from "#server/run-record-contract";

async function readRunShortId(
	runsDirectory: string,
	caseId: string,
	run: string,
): Promise<ShortIdReading> {
	/**
	 * The registry names the run and nothing else, so a registry that cannot
	 * be read costs the record its short id rather than every figure.
	 */
	try {
		const shortId = shortIdsOf(await readShortIds(runsDirectory, caseId)).get(
			formatRecordId({ kind: "run", run }),
		);
		if (shortId === undefined) {
			return {
				reasons: ["no command claimed a short id for the run"],
				state: "unavailable",
			};
		}

		return { shortId, state: "available" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { reasons: [redactAbsolutePaths(message)], state: "unavailable" };
	}
}

function stageCheckpointShortId(
	runShortId: ShortIdReading,
	stages: readonly string[],
	{ stage, checkpoint }: RecordedStage,
): ShortIdReading {
	const number = checkpointStageNumber(stages, stage);
	if (checkpoint === undefined || number === undefined) {
		return {
			reasons: ["the stage saved no checkpoint"],
			state: "unavailable",
		};
	}

	if (runShortId.state === "unavailable") {
		return runShortId;
	}

	return {
		shortId: formatCheckpointShortId(runShortId.shortId, number),
		state: "available",
	};
}

export { readRunShortId, stageCheckpointShortId };
