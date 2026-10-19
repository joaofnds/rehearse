import { join } from "node:path";

import { snapshotStageCorpus } from "./checkpoint";
import type {
	FrozenPipelineInputs,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";

interface FrozenPipelineCorpus extends Pick<
	FrozenPipelineInputs,
	"corpusVersion" | "versionFiles" | "stages"
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
	const stages = await Array.fromAsync(
		request.pipeline.stages,
		async (definition) => {
			const directory = join(corpusRoot, definition.name);
			const files = await snapshotStageCorpus(
				{ instructions: request.instructions, skill: definition.skill },
				request.corpusRoots,
				directory,
			);

			return { definition, directory, files };
		},
	);

	return {
		corpusRoot,
		corpusVersion,
		stages,
		versionFiles,
	};
}
export { freezePipelineCorpus as default };
