import { join } from "node:path";

import { planStageCorpusDelivery, snapshotStageCorpus } from "./checkpoint";
import type {
	FrozenPipelineInputs,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";

interface FrozenPipelineCorpus extends Pick<
	FrozenPipelineInputs,
	"citations" | "corpusVersion" | "versionFiles" | "stages"
> {
	readonly corpusRoot: string;
}
async function freezePipelineCorpus({
	dependencies,
	request,
	directories,
}: PipelineInputExecution): Promise<FrozenPipelineCorpus> {
	const corpusVersion = await dependencies.stageSession.measureCorpus();
	const versionFiles =
		await dependencies.stageSession.corpusVersionFiles(corpusVersion);
	const corpusRoot = join(directories.inputsDirectory, "corpus");
	const citations = await dependencies.liveCitations();
	const stages = await Array.fromAsync(
		request.pipeline.stages,
		async (definition) => {
			const directory = join(corpusRoot, definition.name);
			const files = await snapshotStageCorpus(
				{ instructions: request.instructions, skill: definition.skill },
				request.corpusRoots,
				directory,
			);

			return {
				corpusDelivery: await planStageCorpusDelivery(directory, {
					citations,
					skill: definition.skill,
				}),
				definition,
				directory,
				files,
			};
		},
	);

	return {
		citations,
		corpusRoot,
		corpusVersion,
		stages,
		versionFiles,
	};
}
export { freezePipelineCorpus as default };
