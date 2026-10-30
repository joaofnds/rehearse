import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import freezePipelineCorpus from "./pipeline-corpus-snapshot";
import PipelineFrozenFiles from "./pipeline-frozen-files";
import type {
	FrozenPipelineInputs,
	PipelineInputDirectories,
	PipelineInputExecution,
} from "./pipeline-frozen-inputs";
import PipelineSetupWorktree from "./pipeline-setup-worktree";

async function freezePipelineInputs(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
	directories: PipelineInputDirectories,
): Promise<FrozenPipelineInputs> {
	const execution: PipelineInputExecution = {
		dependencies,
		directories,
		request,
	};
	const corpus = await freezePipelineCorpus(execution);
	const setup = await PipelineSetupWorktree.open(execution);
	const prepared = await setup.freeze();
	const files = await new PipelineFrozenFiles(execution).collect({
		checkpointDirectory: prepared.checkpointDirectory,
		corpusRoot: corpus.corpusRoot,
	});

	return {
		...prepared,
		citations: corpus.citations,
		corpusVersion: corpus.corpusVersion,
		files,
		stages: corpus.stages,
		versionFiles: corpus.versionFiles,
	};
}
export { freezePipelineInputs as default };
