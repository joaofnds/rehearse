import type { RecordedReads } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { loadRunManifest } from "./manifest";
import { benchmarkRunPaths } from "./run-layout";
import type { JudgedReadEntry } from "./staleness-contract";
import {
	currentInstructions,
	stageCorpusNow,
} from "./staleness-current-corpus";
import { judgedReads } from "./staleness-read-manifest";

interface RunStageLocation {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

/**
 * The read manifest of a stage that saved no checkpoint, judged against the
 * corpus under test the way a checkpoint's is, from the corpus files its stage
 * record keeps.
 */
async function judgedStageReads(
	{ runsDirectory, run, stage }: RunStageLocation,
	reads: RecordedReads,
	source: CorpusRoot,
): Promise<readonly JudgedReadEntry[]> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);
	const definition = manifest.pipeline.stages.find(
		({ name }) => name === stage,
	);
	if (definition === undefined) {
		throw new Error(`The run's pipeline does not declare the ${stage} stage`);
	}

	const judged = await judgedReads(reads, {
		current: await stageCorpusNow(
			definition.skill,
			await currentInstructions(source),
			source,
		),
		definition,
		source,
	});

	return judged.readManifest;
}

export { judgedStageReads as default };
