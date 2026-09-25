import type { CorpusRoot } from "./corpus-file";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	CheckpointRecord,
	HashedFile,
	StageCorpus,
	installStageCorpusSnapshot,
	materializeCheckpoint,
} from "./checkpoint";
import type { LoadedStageSettings } from "./stage-settings";
import {
	deriveStaleness,
	hashedCorpus,
	withLoadedFilesNow,
	hashArtifacts,
	INITIAL_CHECKPOINT_STAGE,
	lineageKey,
	readCheckpointRecord,
	stageCorpusRoots,
} from "./checkpoint";
import type { captureBaselineContext, captureFileHashes } from "./checks";
import type { Effort } from "./config";
import type { ContextFile } from "./contracts";
import type { RunManifest } from "./manifest";
import { loadRunManifest } from "./manifest";
import type { StageDefinition } from "./pipeline";
import type { StageSessionDependencies } from "./run";
import { executeStageSession } from "./run";
import type { ReplayRecord } from "./replay-record";
import type { BenchmarkRunPaths } from "./run-layout";
import { runNameFromTimestamp } from "./run-layout";
import { bindReplay, claimShortId } from "./short-id";
import { recordStageReads } from "./stage-reads";
import { stageRubricSha256 } from "./judge-agreement";
import type { loadStageRubric, runStageJudge } from "./stage-grading";
import type { addWorktree, currentSha, removeWorktree } from "./target";
import type { createProductOwner } from "./workflow";

export class ReplayError extends Error {
	public override name = "ReplayError";
}

/**
 * Every checkpoint the run recorded, keyed by stage. The record's own stage
 * name is authoritative; the directory name only locates it.
 */
export async function loadRunCheckpoints(
	runDirectory: string,
): Promise<Map<string, CheckpointRecord>> {
	const checkpoints = new Map<string, CheckpointRecord>();

	for (const entry of await readdir(runDirectory, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const record = await readCheckpointRecord(join(runDirectory, entry.name));
		checkpoints.set(record.stage, record);
	}

	return checkpoints;
}

export interface ReplayPlan {
	readonly definition: StageDefinition;
	readonly consumed: CheckpointRecord;
	readonly priorArtifacts: readonly HashedFile[];
	/** The verified chain from the initial checkpoint to the consumed one. */
	readonly chain: readonly CheckpointRecord[];
}

/**
 * Replaying stage N consumes the checkpoint of stage N-1: the state after
 * that stage was accepted. The whole chain back to the initial checkpoint is
 * verified first, because the prior artifacts fed to the judge are collected
 * from every earlier checkpoint and a broken link would present artifacts
 * that never led to the consumed state.
 */
export function resolveReplay(
	manifest: RunManifest,
	checkpoints: ReadonlyMap<string, CheckpointRecord>,
	stageName: string,
): ReplayPlan {
	const { stages } = manifest.pipeline;
	const index = stages.findIndex(({ name }) => name === stageName);
	const definition = stages[index];
	if (!definition) {
		throw new ReplayError(
			`The run's pipeline has no ${stageName} stage; it declares ${stages
				.map(({ name }) => name)
				.join(", ")}`,
		);
	}

	const initial = checkpoints.get(INITIAL_CHECKPOINT_STAGE);
	if (!initial) {
		throw new ReplayError(
			"The run has no initial checkpoint; runs recorded before initial checkpoints cannot be replayed",
		);
	}

	let consumed = initial;
	const priorArtifacts: HashedFile[] = [];
	const chain: CheckpointRecord[] = [initial];
	for (const earlier of stages.slice(0, index)) {
		const checkpoint = checkpoints.get(earlier.name);
		if (!checkpoint) {
			throw new ReplayError(
				`The run has no checkpoint for the ${earlier.name} stage; it stopped before accepting it`,
			);
		}
		if (checkpoint.upstream !== consumed.lineage) {
			throw new ReplayError(
				`The run's checkpoint chain is broken at the ${earlier.name} stage: it consumed ${checkpoint.upstream}, but ${consumed.stage} produced ${consumed.lineage}`,
			);
		}

		priorArtifacts.push(...checkpoint.artifacts);
		consumed = checkpoint;
		chain.push(checkpoint);
	}

	return { definition, consumed, priorArtifacts, chain };
}

export interface ReplayDependencies {
	readonly stageSession: StageSessionDependencies;
	readonly createProductOwner: typeof createProductOwner;
	readonly runStageJudge: typeof runStageJudge;
	readonly loadStageRubric: typeof loadStageRubric;
	readonly addWorktree: typeof addWorktree;
	readonly removeWorktree: typeof removeWorktree;
	readonly materializeCheckpoint: typeof materializeCheckpoint;
	readonly captureBaselineContext: typeof captureBaselineContext;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly currentSha: typeof currentSha;
	readonly installDependencies: (worktreeDir: string) => Promise<void>;
	readonly installStageCorpusSnapshot: typeof installStageCorpusSnapshot;
	/**
	 * Where the provider writes session transcripts, read for what the stage
	 * loaded. Without it the read manifest holds only what the stage declared.
	 */
	readonly projectsDirectory?: string | undefined;
	readonly log: (message: string) => void;
	/**
	 * The clock the replay's elapsed time is read from; a monotonic one by
	 * default, so a system clock step cannot make it negative.
	 */
	readonly now?: (() => number) | undefined;
}

export interface ReplayRequest {
	readonly corpusSource: CorpusRoot;
	readonly paths: BenchmarkRunPaths;
	readonly stage: string;
	readonly instructions: string;
	readonly controlSha: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly settingSources?: "project" | undefined;
	readonly loadedSettings?: LoadedStageSettings | undefined;
}

export type { ReplayRecord } from "./replay-record";
export { readReplayRecord, replayRecordSchema } from "./replay-record";

export interface ReplayOutcome {
	readonly record: ReplayRecord;
	readonly recordPath: string;
}

/**
 * A replayed stage validates against the worktree's detached HEAD: main
 * cannot be checked out twice, and the primary checkout must stay untouched.
 */
export function detachedStageDependencies(
	base: StageSessionDependencies,
): StageSessionDependencies {
	return {
		...base,
		assertPlanningStageCompleted: (targetDir, taskSha, stage, taskState) =>
			base.assertPlanningStageCompleted(
				targetDir,
				taskSha,
				stage,
				taskState,
				null,
			),
		assertBuildCommitted: (targetDir, taskSha, _branch, commitSubjectPattern) =>
			base.assertBuildCommitted(targetDir, taskSha, null, commitSubjectPattern),
	};
}

/**
 * Prior artifacts reach the judge from the materialized snapshot, verified
 * against the hashes their own checkpoints recorded when they were accepted.
 */
export async function readPriorArtifacts(
	worktreeDir: string,
	recorded: readonly HashedFile[],
): Promise<ContextFile[]> {
	const artifacts: ContextFile[] = [];

	for (const { path, sha256 } of recorded) {
		const file = Bun.file(join(worktreeDir, path));
		if (!(await file.exists())) {
			throw new ReplayError(
				`Prior artifact ${path} is missing from the materialized checkpoint`,
			);
		}

		const content = await file.text();
		if (hashArtifacts([{ path, content }])[0]?.sha256 !== sha256) {
			throw new ReplayError(
				`Prior artifact ${path} does not match its checkpoint record`,
			);
		}

		artifacts.push({ path, content });
	}

	return artifacts;
}

/**
 * The current corpus for each stage in the consumed chain, so staleness
 * compares each checkpoint against the corpus that would feed its stage
 * today. The initial checkpoint consumes no corpus, so it has none to
 * capture. A stage whose skill no longer resolves fails the replay rather
 * than reading as fresh: an uncapturable corpus is not an unchanged one.
 */
async function currentChainCorpus(
	plan: ReplayPlan,
	manifest: RunManifest,
	instructions: string,
	roots: readonly CorpusRoot[],
	source: CorpusRoot,
	captureStageCorpus: StageSessionDependencies["captureStageCorpus"],
): Promise<Map<string, StageCorpus>> {
	const corpus = new Map<string, StageCorpus>();

	for (const record of plan.chain) {
		if (record.stage === INITIAL_CHECKPOINT_STAGE) {
			continue;
		}

		const definition = manifest.pipeline.stages.find(
			({ name }) => name === record.stage,
		);
		if (!definition) {
			throw new ReplayError(
				`The run's pipeline no longer declares the ${record.stage} stage its checkpoint records`,
			);
		}

		corpus.set(
			record.stage,
			await withLoadedFilesNow(
				hashedCorpus(
					await captureStageCorpus(definition.skill, instructions, roots),
				),
				record,
				source,
			),
		);
	}

	return corpus;
}

export async function runReplay(
	dependencies: ReplayDependencies,
	request: ReplayRequest,
): Promise<ReplayOutcome> {
	const manifest = await loadRunManifest(request.paths.manifestFile);
	const checkpoints = await loadRunCheckpoints(
		request.paths.checkpointsDirectory,
	);
	const plan = resolveReplay(manifest, checkpoints, request.stage);
	const shortId = await claimShortId(
		request.paths.runsDirectory,
		manifest.caseId,
		{ kind: "replay", run: request.paths.name, stage: request.stage },
	);

	// The provider names a session's transcript after its real working path.
	const parent = await realpath(
		await mkdtemp(join(tmpdir(), "rehearse-replay-")),
	);
	const worktreeDir = join(parent, "worktree");
	const productOwnerDirectory = join(parent, "product-owner");
	await mkdir(productOwnerDirectory, { recursive: true });
	await dependencies.addWorktree(
		manifest.sourceRoot,
		plan.consumed.targetSha,
		worktreeDir,
	);

	let outcome: ReplayOutcome;
	try {
		await dependencies.materializeCheckpoint(
			request.paths.checkpointDirectory(plan.consumed.stage),
			worktreeDir,
		);
		if (request.corpusSource.kind === "directory") {
			await dependencies.installStageCorpusSnapshot(
				request.corpusSource.root,
				worktreeDir,
			);
		}
		const corpusRoots = stageCorpusRoots(
			request.corpusSource.kind === "directory"
				? { kind: "directory", root: join(worktreeDir, ".claude") }
				: request.corpusSource,
			worktreeDir,
		);
		const baseSha = await dependencies.currentSha(worktreeDir);
		if (plan.definition.kind === "delivery") {
			await dependencies.installDependencies(worktreeDir);
		}
		const priorArtifacts = await readPriorArtifacts(
			worktreeDir,
			plan.priorArtifacts,
		);
		const staleness = deriveStaleness(
			plan.chain,
			await currentChainCorpus(
				plan,
				manifest,
				request.instructions,
				corpusRoots,
				request.corpusSource,
				dependencies.stageSession.captureStageCorpus,
			),
			{
				model: request.model,
				effort: request.effort,
				settingsFile: request.loadedSettings?.hashed,
			},
		).filter(({ stale }) => stale);
		if (staleness.length === 0) {
			dependencies.log("Checkpoint chain is fresh");
		}
		for (const { stage, causes } of staleness) {
			dependencies.log(`Stale checkpoint ${stage}: ${causes.join("; ")}`);
		}
		const baselineHashes = await dependencies.captureFileHashes(
			worktreeDir,
			manifest.pipeline.target.integrityFiles,
		);
		const baselineContext =
			await dependencies.captureBaselineContext(worktreeDir);
		const productOwner = dependencies.createProductOwner({
			directory: productOwnerDirectory,
			model: request.model,
			effort: request.effort,
			sessionBudgetUsd: request.sessionBudgetUsd,
			task: manifest.task,
			productBrief: manifest.productBrief,
		});

		const now = dependencies.now ?? (() => performance.now());
		const stageStartedAtMs = now();
		const session = await executeStageSession(
			detachedStageDependencies(dependencies.stageSession),
			{
				targetDir: worktreeDir,
				model: request.model,
				effort: request.effort,
				sessionBudgetUsd: request.sessionBudgetUsd,
				productOwner,
				task: manifest.task,
				productBrief: manifest.productBrief,
				instructions: request.instructions,
				baselineContext,
				baselineHashes,
				target: manifest.pipeline.target,
				taskId: manifest.taskId,
				taskSha: baseSha,
				baselineSha: baseSha,
				commitSubjectPattern: manifest.pipeline.commitSubjectPattern,
				corpusRoots,
				settingSources: request.settingSources,
				settingsOverlay: request.loadedSettings?.json,
			},
			plan.definition,
			priorArtifacts,
		);

		dependencies.log(`\n${request.stage} stage Judge`);
		const scorecard = await dependencies.runStageJudge(
			request.judgeModel,
			request.judgeEffort,
			request.sessionBudgetUsd,
			session.input,
			await dependencies.loadStageRubric(plan.definition),
		);
		const elapsedMs = now() - stageStartedAtMs;
		const readManifest = await recordStageReads({
			targetDir: worktreeDir,
			startSha: baseSha,
			transcript:
				dependencies.projectsDirectory === undefined
					? undefined
					: {
							sessionId: session.transcript.sessionId,
							projectsDirectory: dependencies.projectsDirectory,
						},
			skill: plan.definition.skill,
			corpusFiles: session.corpusFiles,
			versionFiles: session.versionFiles,
			rubric: {
				path: plan.definition.rubric,
				sha256: stageRubricSha256(scorecard.rubric),
			},
		});

		const timestamp = new Date().toISOString();
		const record: ReplayRecord = {
			replay: true,
			timestamp,
			runName: request.paths.name,
			stage: request.stage,
			consumed: {
				stage: plan.consumed.stage,
				lineage: plan.consumed.lineage,
				targetSha: plan.consumed.targetSha,
			},
			baseSha,
			lineage: lineageKey({
				upstream: plan.consumed.lineage,
				corpusFiles: session.corpusFiles,
				model: request.model,
				effort: request.effort,
				settingsFile: request.loadedSettings?.hashed,
			}),
			corpusFiles: session.corpusFiles,
			corpusVersion: session.corpusVersion,
			settingsFile: request.loadedSettings?.hashed,
			model: request.model,
			effort: request.effort,
			judgeModel: request.judgeModel,
			judgeEffort: request.judgeEffort,
			sessionBudgetUsd: request.sessionBudgetUsd,
			controlSha: request.controlSha,
			stageCostUsd: session.transcript.costUsd,
			productOwnerCostUsd: productOwner.snapshot().spentUsd,
			judgeCostUsd: scorecard.costUsd,
			resultSha: session.buildEvidence?.resultSha,
			stale: staleness.length > 0,
			staleness: staleness.map(({ stage, causes }) => ({ stage, causes })),
			scorecard,
			elapsedMs,
			readManifest,
		};
		const recordPath = request.paths.replayRecordFile(
			plan.consumed.lineage,
			timestamp,
		);
		await bindReplay(request.paths.runsDirectory, shortId, {
			lineage: plan.consumed.lineage,
			timestamp: runNameFromTimestamp(timestamp),
		});
		await Bun.write(recordPath, `${JSON.stringify(record, null, 2)}\n`);
		outcome = { record, recordPath };
	} catch (error) {
		dependencies.log(`Replay failed; evidence preserved at ${worktreeDir}`);
		throw error;
	}

	await dependencies.removeWorktree(manifest.sourceRoot, worktreeDir);
	await rm(parent, { force: true, recursive: true });

	return outcome;
}
