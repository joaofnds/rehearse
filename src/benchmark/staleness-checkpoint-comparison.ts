import type { CheckpointStaleness, StageCorpus } from "./checkpoint";
import {
	INITIAL_CHECKPOINT_STAGE,
	deriveStaleness,
	readCorpusFiles,
} from "./checkpoint";
import type { CorpusUnderTest, VersionDistance } from "./corpus-version";
import { compareCurrentStageSettings } from "./current-stage-settings";
import type { RecordedRunHistory } from "./staleness-checkpoint-history";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
} from "./staleness-contract";
import { currentStageCorpus } from "./staleness-current-corpus";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";
import {
	chainRubricCauses,
	comparedCorpus,
	judgedReadManifest,
} from "./staleness-read-manifest";

/**
 * The initial checkpoint freezes the target before any stage reads the
 * corpus, so no version applies to it, whenever its run was recorded.
 */
const INITIAL_CHECKPOINT_DISTANCE: VersionDistance = {
	kind: "not-recorded",
	reason: "the initial checkpoint reads no corpus",
};

async function judgeCheckpointHistory(
	history: RecordedRunHistory,
	{ source, instructions, underTest }: CorpusJudgedAgainst,
	knobs: CurrentSessionKnobs,
): Promise<RecordStaleness[]> {
	const {
		manifest,
		checkpoints: { chain },
	} = history;
	const current = await currentStageCorpus(
		{ chain, manifest },
		source,
		instructions,
	);
	const settings = await compareCurrentStageSettings(manifest.caseId);
	const differences = deriveStaleness(chain, current, {
		effort: knobs.effort ?? manifest.effort,
		judgeRubricCauses: await chainRubricCauses(chain, manifest.pipeline.stages),
		model: knobs.model ?? manifest.model,
		...settings,
	});
	return await checkpointRecords(history, {
		current,
		differences,
		underTest,
	});
}

interface CheckpointComparison {
	readonly current: ReadonlyMap<string, StageCorpus>;
	readonly underTest: CorpusUnderTest;
	readonly differences: readonly CheckpointStaleness[];
}

async function checkpointRecords(
	{
		manifest,
		location: { run },
		checkpoints: { chain, stopped },
	}: RecordedRunHistory,
	{ current, underTest, differences }: CheckpointComparison,
): Promise<RecordStaleness[]> {
	const byStage = new Map(chain.map((record) => [record.stage, record]));
	const judged: RecordStaleness[] = [];
	await Array.fromAsync(differences, async (staleness) => {
		const readManifest = await judgedReadManifest(
			byStage.get(staleness.stage)?.readManifest,
			comparedCorpus(current.get(staleness.stage), staleness),
			manifest.pipeline.stages.find(({ name }) => name === staleness.stage),
		);
		judged.push({
			causes: staleness.causes,
			changedFiles: staleness.changedFiles,
			distance:
				staleness.stage === INITIAL_CHECKPOINT_STAGE
					? INITIAL_CHECKPOINT_DISTANCE
					: underTest.distanceOf(byStage.get(staleness.stage)?.corpusVersion),
			id:
				staleness.stage === stopped?.stage
					? `run:${run}`
					: `checkpoint:${run}/${staleness.stage}`,
			onlyCorpusFiles: staleness.onlyCorpusFiles,
			readFiles: readCorpusFiles(
				byStage.get(staleness.stage) ?? { corpusFiles: [] },
			),
			readManifest,
			stale: staleness.stale,
		});
	});
	return judged;
}

export { judgeCheckpointHistory as default };
