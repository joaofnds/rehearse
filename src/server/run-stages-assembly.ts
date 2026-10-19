import { basename } from "node:path";

import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import type {
	CostPart,
	MissingPart,
	PlacedStage,
	RunRecordStage,
	ShortIdReading,
} from "#server/run-record-contract";
import type { RunRecordSource } from "#server/run-record-source";
import { stageCostParts } from "#server/run-record-totals";
import { stageCheckpointShortId } from "#server/run-short-id-reading";
import { stageRecord } from "#server/run-stage-assembly";
import { artifactsIn } from "#server/run-workflow-artifacts";
import type { Upstream } from "#server/run-workflow-artifacts";

const LATEST_STAGE_OFFSET = -1;

interface RunStages {
	readonly records: RunRecordStage[];
	readonly cost: (CostPart | MissingPart)[];
}

interface StageAssemblyContext {
	readonly source: RunRecordSource;
	readonly names: readonly string[];
	readonly target: string;
	readonly initialShortId: ShortIdReading;
	readonly previous: RunRecordStage | undefined;
	readonly earlier: readonly RunRecordStage[];
}

function assembledStage(
	stage: PlacedStage,
	{
		source,
		names,
		target,
		initialShortId,
		previous,
		earlier,
	}: StageAssemblyContext,
): RunRecordStage {
	const { manifest, checkpoints, shortId } = source;
	const upstream: Upstream =
		previous === undefined
			? {
					checkpointShortId: initialShortId,
					target,
					upstream: INITIAL_CHECKPOINT_STAGE,
				}
			: {
					checkpointShortId: previous.checkpointShortId,
					target,
					upstream: previous.stage,
				};

	return stageRecord(stage, {
		checkpointShortId: stageCheckpointShortId(shortId, names, stage),
		checkpoints,
		inputs: artifactsIn(manifest.taskId, upstream, earlier),
		minimumGrade: manifest.minimumGrade,
	});
}

function assembleRunStages(
	source: RunRecordSource,
	placed: readonly PlacedStage[],
): RunStages {
	const { manifest, initial, shortId } = source;
	const names = placed.map(({ stage }) => stage);
	const target = basename(manifest.targetRoot ?? manifest.sourceRoot);
	const initialShortId = stageCheckpointShortId(shortId, names, {
		checkpoint: initial,
		file: undefined,
		stage: INITIAL_CHECKPOINT_STAGE,
	});
	const result: RunStages = { cost: [], records: [] };
	for (const stage of placed) {
		const record = assembledStage(stage, {
			earlier: result.records,
			initialShortId,
			names,
			previous: result.records.at(LATEST_STAGE_OFFSET),
			source,
			target,
		});
		result.records.push(record);
		result.cost.push(...stageCostParts(record, stage));
	}

	return result;
}

export { assembleRunStages as default };
