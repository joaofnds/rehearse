import type { StageTranscriptSource } from "./checkpoint";
import { stageRubricSha256 } from "./judge-agreement";
import type { StageContext } from "./run-stage-context";
import type { StageRunObservation } from "./run-stage-iteration";
import type { StageJudgmentSources } from "./run-stage-judgment-contract";
import { corpusSourceDirectories, recordStageReads } from "./stage-reads";
import { loadStageRubric } from "./stage-rubric";

interface StageRubricReadRequest {
	readonly context: StageContext;
	readonly observation: StageRunObservation;
	readonly stageTranscript: StageTranscriptSource | undefined;
	readonly startSha: string;
}

async function readStageJudgmentSources({
	context,
	observation,
	stageTranscript,
	startSha,
}: StageRubricReadRequest): Promise<StageJudgmentSources> {
	const { definition, corpusFiles, versionFiles } = observation;

	const loaded = await loadStageRubric(definition);

	const reads = await recordStageReads({
		corpusFiles,
		corpusSources: corpusSourceDirectories(context.corpusSource),
		rubric: {
			path: definition.rubric,
			sha256: stageRubricSha256(loaded.rubric),
		},
		skill: definition.skill,
		startSha,
		targetDir: context.targetDir,
		transcript: stageTranscript,
		versionFiles,
	});

	return { readManifest: reads, rubric: loaded };
}

export { readStageJudgmentSources as default };
