import { loadRunManifest } from "./manifest";
import type { StageDefinition } from "./pipeline";
import type { ReplayRecord } from "./replay-record";
import { benchmarkRunPaths } from "./run-layout";

async function replayedStage(
	runsDirectory: string,
	record: Pick<ReplayRecord, "runName" | "stage">,
): Promise<StageDefinition> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, record.runName).manifestFile,
	);
	const definition = manifest.pipeline.stages.find(
		({ name }) => name === record.stage,
	);
	if (definition === undefined) {
		throw new Error(
			`the run's pipeline does not declare the ${record.stage} stage it replayed`,
		);
	}

	return definition;
}

export { replayedStage as default };
