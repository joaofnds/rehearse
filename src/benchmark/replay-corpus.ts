import { join } from "node:path";

import type { HashedFile, StageCorpus } from "./checkpoint";
import {
	INITIAL_CHECKPOINT_STAGE,
	hashArtifacts,
	hashedCorpus,
	withLoadedFilesNow,
} from "./checkpoint";
import type { ContextFile } from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import type { RunManifest } from "./manifest";
import ReplayError from "./replay-contract";
import type { ReplayPlan } from "./replay-contract";
import type { StageSessionDependencies } from "./stage-session-dependencies";

/**
 * Prior artifacts reach the judge from the materialized snapshot, verified
 * against the hashes their own checkpoints recorded when they were accepted.
 */
async function readPriorArtifacts(
	worktreeDir: string,
	recorded: readonly HashedFile[],
): Promise<ContextFile[]> {
	const artifacts: ContextFile[] = [];

	await Array.fromAsync(recorded, async ({ path, sha256 }) => {
		const file = Bun.file(join(worktreeDir, path));
		if (!(await file.exists())) {
			throw new ReplayError(
				`Prior artifact ${path} is missing from the materialized checkpoint`,
			);
		}

		const content = await file.text();
		const [artifactHash] = hashArtifacts([{ content, path }]);
		if (artifactHash?.sha256 !== sha256) {
			throw new ReplayError(
				`Prior artifact ${path} does not match its checkpoint record`,
			);
		}

		artifacts.push({ content, path });
	});

	return artifacts;
}
interface ReplayCorpusHistory {
	readonly plan: ReplayPlan;
	readonly manifest: RunManifest;
}
interface ReplayCorpusSources {
	readonly instructions: string;
	readonly roots: readonly CorpusRoot[];
	readonly source: CorpusRoot;
}
/**
 * The current corpus for each stage in the consumed chain, so staleness
 * compares each checkpoint against the corpus that would feed its stage
 * today. The initial checkpoint consumes no corpus, so it has none to
 * capture. A stage whose skill no longer resolves fails the replay rather
 * than reading as fresh: an uncapturable corpus is not an unchanged one.
 */
async function currentChainCorpus(
	{ plan, manifest }: ReplayCorpusHistory,
	{ instructions, roots, source }: ReplayCorpusSources,
	captureStageCorpus: StageSessionDependencies["captureStageCorpus"],
): Promise<Map<string, StageCorpus>> {
	const corpus = new Map<string, StageCorpus>();

	await Array.fromAsync(plan.chain, async (record) => {
		if (record.stage === INITIAL_CHECKPOINT_STAGE) {
			return;
		}

		const definition = manifest.pipeline.stages.find(
			({ name }) => name === record.stage,
		);
		if (!definition) {
			throw new ReplayError(
				`The run's pipeline no longer declares the ${record.stage} stage its checkpoint records`,
			);
		}

		const { stage } = record;
		const capturedCorpus = await captureStageCorpus(
			definition.skill,
			instructions,
			roots,
		);
		const currentCorpus = await withLoadedFilesNow(
			hashedCorpus(capturedCorpus),
			record,
			source,
		);
		corpus.set(stage, currentCorpus);
	});

	return corpus;
}
export { readPriorArtifacts, currentChainCorpus };
