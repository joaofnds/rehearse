import type { CorpusRoot } from "./corpus-file";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckpointRecord, HashedFile } from "./checkpoint";
import { materializeCheckpoint, recordCheckpoint } from "./checkpoint";
import { runCommand } from "./command";
import type { StageJudgeInput, StageScorecard } from "./contracts";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { TargetCheck } from "./pipeline";
import type { ReplayDependencies } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation";
import { runReplayConfirmation } from "./replay-confirmation";
import type { BenchmarkRunPaths } from "./run-layout";
import { benchmarkRunPaths } from "./run-layout";
import { TEST_TARGET, commitAll, harnessResult } from "./test-support";
import { createProductOwner } from "./workflow";

interface DirectoryTracker {
	readonly track: (directory: string) => void;
}

export const REPLAY_SPEC_CONTENT = "the spec\n";
export const REPLAY_SPEC_PATH = "backlog/docs/DOC-1 - spec.md";

export interface RecordedRun {
	readonly paths: ReturnType<typeof benchmarkRunPaths>;
	readonly manifest: RunManifest;
	readonly initial: CheckpointRecord;
	readonly discuss: CheckpointRecord;
	readonly build: CheckpointRecord;
}

export type ReplayDependencyOverride = (
	defaults: ReplayDependencies,
) => ReplayDependencies;

export interface ReplayConfirmationInputs {
	readonly paths: BenchmarkRunPaths;
	readonly corpusRoots: readonly [CorpusRoot, ...CorpusRoot[]];
}

export type ReplayConfirmationRequestOverride = Partial<
	Omit<ReplayConfirmationRequest, "paths" | "corpusRoots">
>;

export class ReplayConfirmationHarness {
	public readonly dependencies: ReplayDependencies;
	public readonly stageDirs: string[] = [];
	public readonly branchExpectations: (string | null | undefined)[] = [];
	public readonly worktrees: { root: string; sha: string; path: string }[] = [];
	public readonly removed: string[] = [];
	public readonly installed: string[] = [];
	public readonly targetChecks: (readonly TargetCheck[])[] = [];
	public readonly integrityFileSets: (readonly string[])[] = [];
	public readonly judged: StageJudgeInput[] = [];
	public readonly log: string[] = [];
	public readonly corpusCaptures: {
		readonly skill: string;
		readonly instructions: string;
		readonly roots: readonly CorpusRoot[];
	}[] = [];
	public readonly settingSources: (string | undefined)[] = [];
	public readonly settingsOverlays: (string | undefined)[] = [];
	public readonly corpusInstalls: {
		readonly snapshotDirectory: string;
		readonly targetDirectory: string;
	}[] = [];

	public constructor(
		private readonly resources: DirectoryTracker,
		...overrides: readonly ReplayDependencyOverride[]
	) {
		let dependencies = this.defaultDependencies();
		for (const override of overrides) {
			dependencies = override(dependencies);
		}
		this.dependencies = dependencies;
	}

	public async recordedRun(
		discussCorpus: readonly HashedFile[] = [],
	): Promise<RecordedRun> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-replayrun-"));
		this.resources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const stateDir = join(directory, "state");
		const sourceRoot = join(directory, "primary");
		await mkdir(sourceRoot);
		await runCommand(["git", "init", "-b", "main"], sourceRoot);
		await runCommand(
			["git", "config", "user.name", "Benchmark Test"],
			sourceRoot,
		);
		await runCommand(
			["git", "config", "user.email", "benchmark@example.com"],
			sourceRoot,
		);
		await Bun.write(join(sourceRoot, "base.txt"), "base\n");
		await commitAll(sourceRoot, "chore: base");
		const head = await runCommand(["git", "rev-parse", "HEAD"], sourceRoot);
		const taskSha = head.trim();
		await mkdir(join(stateDir, "backlog", "docs"), { recursive: true });
		await Bun.write(join(stateDir, "backlog", "config.yml"), "statuses: []\n");
		const initial = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("initial"),
			{
				stage: "initial",
				targetSha: taskSha,
				upstream: "root-key",
				model: "sonnet",
				corpusFiles: [],
				artifacts: [],
			},
		);
		await Bun.write(join(stateDir, REPLAY_SPEC_PATH), REPLAY_SPEC_CONTENT);
		const discuss = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("discuss"),
			{
				stage: "discuss",
				targetSha: taskSha,
				upstream: initial.lineage,
				model: "sonnet",
				corpusFiles: discussCorpus,
				artifacts: [
					{
						path: REPLAY_SPEC_PATH,
						sha256: createHash("sha256")
							.update(REPLAY_SPEC_CONTENT)
							.digest("hex"),
					},
				],
			},
		);
		const build = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("build"),
			{
				stage: "build",
				targetSha: taskSha,
				upstream: discuss.lineage,
				model: "sonnet",
				corpusFiles: [
					{
						path: "skills/build/SKILL.md",
						sha256: createHash("sha256").update("build").digest("hex"),
					},
				],
				artifacts: [],
			},
		);
		const manifest: RunManifest = {
			caseId: "audit-log",
			timestamp: "2026-08-30T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot,
			sourceSha: taskSha,
			taskId: "TASK-1",
			taskSha,
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "discuss",
						kind: "planning",
						skill: "discuss",
						artifact: "spec",
						rubric: "rubrics/discuss.json",
						requiresAcceptanceCriteria: false,
					},
					{
						name: "build",
						kind: "delivery",
						skill: "build",
						rubric: "rubrics/build.json",
					},
					{
						name: "review",
						kind: "delivery",
						skill: "review",
						rubric: "rubrics/review.json",
					},
				],
			},
		};
		await writeRunManifest(paths.manifestFile, manifest);

		return { paths, manifest, initial, discuss, build };
	}

	public runConfirmation(
		inputs: ReplayConfirmationInputs,
		requestOverride: ReplayConfirmationRequestOverride = {},
		...dependencyOverrides: readonly ReplayDependencyOverride[]
	): ReturnType<typeof runReplayConfirmation> {
		let { dependencies } = this;
		for (const override of dependencyOverrides) {
			dependencies = override(dependencies);
		}
		const { paths, corpusRoots } = inputs;
		const { reps = 3 } = requestOverride;
		const request: ReplayConfirmationRequest = {
			corpusSource: corpusRoots[0],
			paths,
			stage: "discuss",
			instructions: "Frozen instructions\n",
			controlSha: "control-sha",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			groupId: "confirmation-stage-1",
			reps,
			corpusRoots,
			projectedCost: {
				reps,
				perRepMaximumUsd: 20,
				totalMaximumUsd: reps * 20,
			},
			approvalMethod: "yes",
			...requestOverride,
		};

		return runReplayConfirmation(dependencies, request);
	}

	private defaultDependencies(): ReplayDependencies {
		return {
			createProductOwner,
			stageSession: {
				runWorkflowStage: ({
					targetDir,
					stage,
					settingSources,
					settingsOverlay,
				}) => {
					this.stageDirs.push(targetDir);
					this.settingSources.push(settingSources);
					this.settingsOverlays.push(settingsOverlay);

					return Promise.resolve({
						stage,
						sessionId: "session",
						costUsd: 1.25,
						providerCalls: [],
						exchanges: [],
					});
				},
				readTaskOutput: (targetDir) => {
					this.stageDirs.push(targetDir);

					return Promise.resolve(
						JSON.stringify({
							task: { acceptanceCriteria: ["done"], documentation: [] },
						}),
					);
				},
				readTaskCard: () => Promise.resolve("the task card"),
				captureBuildCandidate: (targetDir) => {
					this.stageDirs.push(targetDir);

					return Promise.resolve({
						resultSha: "candidate-sha",
						diff: "diff",
						changedPaths: [],
					});
				},
				assertPlanningStageCompleted: (
					targetDir,
					baselineSha,
					stage,
					_taskState,
					expectedBranch,
				) => {
					this.stageDirs.push(targetDir);
					this.branchExpectations.push(expectedBranch);

					return Promise.resolve({
						taskState: `${stage.name}-state`,
						artifact: {
							path: `backlog/docs/${stage.name}.md`,
							content: `${stage.name} artifact`,
						},
						resultSha: baselineSha,
						diff: "",
						changedPaths: [],
					});
				},
				assertBuildCommitted: (targetDir, _taskSha, expectedBranch) => {
					this.stageDirs.push(targetDir);
					this.branchExpectations.push(expectedBranch);

					return Promise.resolve({
						resultSha: "result-sha",
						diff: "the-diff",
						commitSubjects: ["replayed commit"],
					});
				},
				changedPathsBetween: (targetDir) => {
					this.stageDirs.push(targetDir);

					return Promise.resolve(["src/example.ts"]);
				},
				captureCheckIntegrity: (targetDir) => {
					this.stageDirs.push(targetDir);

					return Promise.resolve(harnessResult("PASS", "checks match"));
				},
				captureTreatmentChecks: (targetDir, checks) => {
					this.stageDirs.push(targetDir);
					this.targetChecks.push(checks);

					return Promise.resolve(harnessResult("PASS", "all green"));
				},
				captureStageCorpus: (skill, instructions, roots) => {
					this.corpusCaptures.push({ skill, instructions, roots });

					return Promise.resolve([
						{
							path: `skills/${skill}/SKILL.md`,
							sha256: createHash("sha256").update(skill).digest("hex"),
						},
					]);
				},
				measureCorpus: () =>
					Promise.resolve({ kind: "version", digest: "c".repeat(64) }),
				corpusVersionFiles: () => Promise.resolve([]),
			},
			runStageJudge: (_model, _effort, _budget, input) => {
				this.judged.push(input);

				return Promise.resolve(replayScorecard(input));
			},
			loadStageRubric: () =>
				Promise.resolve({
					rubricPath: "rubrics/stage.json",
					content: "{}",
					rubric: {
						hardBlockers: [],
						requirements: [{ id: "scope", description: "Scope is explicit" }],
						dimensions: [
							{
								id: "clarity",
								description: "Clear",
								good: "g",
								excellent: "e",
							},
						],
					},
				}),
			addWorktree: (root, sha, path) => {
				this.worktrees.push({ root, sha, path });

				return Promise.resolve();
			},
			removeWorktree: (_root, path) => {
				this.removed.push(path);

				return Promise.resolve();
			},
			materializeCheckpoint,
			captureFileHashes: (targetDir, integrityFiles) => {
				this.stageDirs.push(targetDir);
				this.integrityFileSets.push(integrityFiles);

				return Promise.resolve(new Map<string, string>());
			},
			captureBaselineContext: (targetDir) => {
				this.stageDirs.push(targetDir);

				return Promise.resolve([]);
			},
			currentSha: (targetDir: string) => {
				this.stageDirs.push(targetDir);

				return Promise.resolve("base-sha");
			},
			installDependencies: (targetDir) => {
				this.installed.push(targetDir);

				return Promise.resolve();
			},
			installStageCorpusSnapshot: (snapshotDirectory, targetDirectory) => {
				this.corpusInstalls.push({ snapshotDirectory, targetDirectory });

				return Promise.resolve();
			},
			log: (message) => {
				this.log.push(message);
			},
		};
	}
}

export function replayScorecard(
	input: StageJudgeInput,
	verdict: "CONTINUE" | "STOP" = "CONTINUE",
): StageScorecard {
	return {
		stage: input.stage,
		rubricPath: "rubrics/stage.json",
		rubric: {
			hardBlockers: [],
			requirements: [{ id: "scope", description: "Scope is explicit" }],
			dimensions: [
				{ id: "clarity", description: "Clear", good: "g", excellent: "e" },
			],
		},
		input,
		prompt: "prompt",
		attempts: [],
		costUsd: 0.5,
		grade: {
			hardBlockers: [],
			requirements: [],
			dimensions: [],
			summary: "graded",
			grade: verdict === "CONTINUE" ? "B" : "F",
			verdict,
		},
	};
}
