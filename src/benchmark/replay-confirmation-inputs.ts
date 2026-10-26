import { cp } from "node:fs/promises";
import { join } from "node:path";

import type { FrozenFile } from "./confirmation-evidence";
import type { CorpusMeasurement } from "./corpus-measurement";
import { loadRunManifest } from "./manifest";
import { loadRunCheckpoints, resolveReplay } from "./replay";
import type { ReplayDependencies } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import captureFrozenReplayCorpus from "./replay-confirmation-corpus";
import writeReplayFrozenFiles from "./replay-confirmation-frozen-files";

interface FrozenReplayInputs {
	readonly manifest: Awaited<ReturnType<typeof loadRunManifest>>;
	readonly plan: ReturnType<typeof resolveReplay>;
	readonly sourceRoot: string;
	readonly checkpointDirectory: string;
	readonly corpusDirectory: string;
	readonly rubric: Awaited<ReturnType<ReplayDependencies["loadStageRubric"]>>;
	readonly instructions: string;
	readonly corpusVersion: CorpusMeasurement;
	readonly files: readonly FrozenFile[];
}
interface ReplayInputDirectories {
	readonly groupDirectory: string;
	readonly inputsDirectory: string;
}
async function freezeReplayInputs(
	dependencies: ReplayDependencies,
	request: ReplayConfirmationRequest,
	directories: ReplayInputDirectories,
): Promise<FrozenReplayInputs> {
	const corpusVersion = await dependencies.stageSession.measureCorpus();
	const lineage = await loadReplayLineage(
		dependencies,
		request,
		directories.inputsDirectory,
	);
	const corpusRoot = join(directories.inputsDirectory, "corpus");
	await captureFrozenReplayCorpus({
		corpusRoot,
		lineage,
		request,
	});
	const rubric = await dependencies.loadStageRubric(lineage.plan.definition);
	const files = await writeReplayFrozenFiles({
		corpusRoot,
		directories,
		lineage,
		request,
		rubric,
	});

	return {
		checkpointDirectory: lineage.checkpointDirectory,
		corpusDirectory: join(corpusRoot, lineage.plan.definition.name),
		corpusVersion,
		files,
		instructions: request.instructions,
		manifest: lineage.manifest,
		plan: lineage.plan,
		rubric,
		sourceRoot: lineage.sourceRoot,
	};
}
type ReplayLineage = Pick<
	FrozenReplayInputs,
	"manifest" | "plan" | "sourceRoot" | "checkpointDirectory"
>;
async function loadReplayLineage(
	dependencies: ReplayDependencies,
	request: ReplayConfirmationRequest,
	inputsDirectory: string,
): Promise<ReplayLineage> {
	const manifest = await loadRunManifest(request.paths.manifestFile);
	const checkpoints = await loadRunCheckpoints(
		request.paths.checkpointsDirectory,
	);
	const plan = resolveReplay(manifest, checkpoints, request.stage);
	const sourceRoot = await dependencies.replaySourceRoot(
		{
			checkout: manifest.sourceRoot,
			declared: request.declaredTargetRoot,
			target: manifest.targetRoot,
		},
		plan.consumed.targetSha,
	);
	const checkpointDirectory = join(inputsDirectory, "checkpoint");
	await cp(
		request.paths.checkpointDirectory(plan.consumed.stage),
		checkpointDirectory,
		{ recursive: true },
	);

	return { checkpointDirectory, manifest, plan, sourceRoot };
}
export { freezeReplayInputs as default };
export type { FrozenReplayInputs, ReplayInputDirectories, ReplayLineage };
