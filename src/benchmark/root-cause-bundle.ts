import { loadRunManifest } from "./manifest";
import type {
	BundleCorpusFile,
	BundleStage,
	RootCauseBundle,
} from "./root-cause-bundle-contract";
import { runOutcome } from "./root-cause-outcome";
import {
	bundleStage,
	corpusBodies,
	readStageRecord,
} from "./root-cause-stage-readings";
import { benchmarkRunPaths } from "./run-layout";
/**
 * Assembles the run's manifest, each stage's grade or stop, the run's outcome
 * and the bodies of the corpus files each stage read, taken from the corpus
 * version the stage recorded rather than the corpus as it is now.
 */
async function assembleRootCauseBundle(
	runsDirectory: string,
	run: string,
): Promise<RootCauseBundle> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const manifest = await loadRunManifest(paths.manifestFile);
	const declaredStages = manifest.pipeline.stages.map(({ name }) => name);

	const stages: BundleStage[] = [];
	const corpusFiles = new Map<string, BundleCorpusFile>();
	await Array.fromAsync(declaredStages, async (stage) => {
		const record = await readStageRecord(Bun.file(paths.stageFile(stage)));
		// A ceiling stop has no input because no session ran in the stage.
		if (record?.input === undefined) {
			return;
		}

		stages.push(bundleStage(stage, record));
		for (const body of await corpusBodies(runsDirectory, record)) {
			const key = `${body.path}\n${body.sha256}`;
			const readBy = corpusFiles.get(key)?.readBy ?? [];
			corpusFiles.set(key, { ...body, readBy: [...readBy, stage] });
		}
	});

	return {
		caseId: manifest.caseId,
		corpusFiles: [...corpusFiles.values()],
		declaredStages,
		outcome: await runOutcome(runsDirectory, run),
		productBrief: manifest.productBrief,
		run,
		stages,
		task: manifest.task,
	};
}

export { assembleRootCauseBundle };
export { recordedOutcome } from "./root-cause-outcome";
export type {
	BundleStage,
	BundleOutcome,
	BundleCorpusFile,
	RootCauseBundle,
} from "./root-cause-bundle-contract";
