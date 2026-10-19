import { consumedCheckpointStage } from "#benchmark/checkpoint";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { readAllShortIds } from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";
import { checkpointShortId, shortIdsOf } from "#cli/short-id-column";
import attemptOf from "#server/stage-attempt-reading";
import type {
	Lookup,
	StageAttempt,
	StageAttempts,
} from "#server/stage-attempts-contract";

import { attemptsAtCheckpoint } from "./checkpoint-attempts";
import { recordStaleness } from "./run-history";
import { verifiedStageOfRun } from "./stage-record";

async function readStageAttempts(request: {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly source: CorpusRoot;
}): Promise<StageAttempts> {
	const { runsDirectory, source } = request;
	const { manifest, run, stage } = await verifiedStageOfRun(request);
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	const startedFrom = consumedCheckpointStage(stages, stages.indexOf(stage));
	const { entries } = await readAllShortIds(runsDirectory);
	const shortIds = shortIdsOf(entries);
	const lookup: Lookup = {
		run,
		runsDirectory,
		shortIds,
		stage,
		staleness: await recordStaleness(runsDirectory, source),
	};
	const attempts: StageAttempt[] = [];
	await Array.fromAsync(
		await attemptsAtCheckpoint(runsDirectory, entries, {
			run,
			stage,
		}),
		async (attempt) => {
			attempts.push(await attemptOf(lookup, attempt));
		},
	);

	return {
		attempts,
		checkpoint:
			(await checkpointShortId(runsDirectory, shortIds, {
				run,
				stage: startedFrom,
			})) ?? formatRecordId({ kind: "checkpoint", run, stage: startedFrom }),
	};
}

export { readStageAttempts as default };
export type {
	StageAttempt,
	StageAttempts,
} from "#server/stage-attempts-contract";
