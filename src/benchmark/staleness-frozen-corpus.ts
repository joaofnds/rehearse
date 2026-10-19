import { join } from "node:path";

import type { HashedFile, StageCorpus } from "./checkpoint";
import { hashedCorpus } from "./checkpoint";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { CorpusRoot } from "./corpus-file";
import { textIfPresent } from "./file-presence";
import { pipelineDefinitionSchema } from "./pipeline";
import type { PipelineDefinition, StageDefinition } from "./pipeline";
import type { ConfirmationGroupPaths } from "./run-layout";
import { stageCorpusNow } from "./staleness-current-corpus";
import type { CurrentInstructions } from "./staleness-current-corpus";

const EMPTY_COLLECTION_LENGTH = 0;

const FROZEN_CORPUS = "inputs/corpus/";

type FrozenGroupFile = ParsedConfirmationGroupRecord["inputs"]["files"][number];

/** The frozen corpus files under one prefix, by the layout path each holds. */
function frozenCorpusFiles(
	files: readonly FrozenGroupFile[],
	prefix: string,
): readonly HashedFile[] {
	return files
		.filter(({ kind, path }) => kind === "corpus" && path.startsWith(prefix))
		.map(({ path, sha256 }) => ({ path: path.slice(prefix.length), sha256 }));
}

async function frozenPipeline(
	groupDirectory: string,
	files: readonly FrozenGroupFile[],
): Promise<PipelineDefinition> {
	const frozen = files.find(({ kind }) => kind === "pipeline");
	if (frozen === undefined) {
		throw new Error("the group froze no pipeline to hash its stages against");
	}

	const text = await textIfPresent(join(groupDirectory, frozen.path));
	if (text === undefined) {
		throw new Error(`the group's frozen pipeline ${frozen.path} is missing`);
	}

	return pipelineDefinitionSchema.parse(JSON.parse(text));
}

interface CurrentCorpusInputs {
	readonly instructions: CurrentInstructions;
	readonly source: CorpusRoot;
}

interface FrozenStageCorpus {
	readonly stage: StageDefinition;
	readonly corpusFiles: readonly HashedFile[];
	readonly current: StageCorpus;
}

/** Each stage the group froze a corpus for, with that stage's corpus now. */
async function frozenStageCorpora(
	paths: ConfirmationGroupPaths,
	files: readonly FrozenGroupFile[],
	{ instructions, source }: CurrentCorpusInputs,
): Promise<readonly FrozenStageCorpus[]> {
	const pipeline = await frozenPipeline(paths.directory, files);
	const stages: FrozenStageCorpus[] = [];
	await Array.fromAsync(pipeline.stages, async (stage) => {
		const corpusFiles = frozenCorpusFiles(
			files,
			`${FROZEN_CORPUS}${stage.name}/`,
		);
		if (corpusFiles.length === EMPTY_COLLECTION_LENGTH) {
			return;
		}

		const current = await stageCorpusNow(stage.skill, instructions, source);
		stages.push({
			corpusFiles,
			current: frozeOwnSkill(corpusFiles, stage.skill)
				? current
				: withoutSkill(current, stage.skill),
			stage,
		});
	});

	return stages;
}

/**
 * A stage replay freezes its own skill unless it ran without it, as a
 * comparison's control group does, and a group that ran without it is judged
 * on the rest of the stage's corpus.
 */
function frozeOwnSkill(
	corpusFiles: readonly HashedFile[],
	skill: string,
): boolean {
	return corpusFiles.some(({ path }) => path.startsWith(`skills/${skill}/`));
}

function withoutSkill(corpus: StageCorpus, skill: string): StageCorpus {
	if ("refused" in corpus) {
		return corpus;
	}

	return hashedCorpus(
		corpus.hashed.filter(({ path }) => !path.startsWith(`skills/${skill}/`)),
	);
}

export { frozenPipeline, frozenStageCorpora, frozenCorpusFiles, FROZEN_CORPUS };

export type { FrozenGroupFile, CurrentCorpusInputs };
