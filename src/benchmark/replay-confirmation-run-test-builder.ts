import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointRecord, HashedFile } from "./checkpoint";
import { recordCheckpoint } from "./checkpoint";
import { runCommand } from "./command";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { TargetDefinition } from "./pipeline";
import { benchmarkRunPaths } from "./run-layout";
import { TEST_TARGET, commitAll } from "./test-support";

interface DirectoryTracker {
	readonly track: (directory: string) => void;
}
interface RecordedRun {
	readonly paths: ReturnType<typeof benchmarkRunPaths>;
	readonly manifest: RunManifest;
	readonly initial: CheckpointRecord;
	readonly discuss: CheckpointRecord;
	readonly build: CheckpointRecord;
}
const REPLAY_SPEC_CONTENT = "the spec\n";
const REPLAY_SPEC_PATH = "backlog/docs/DOC-1 - spec.md";
interface RecordedReplayRunOptions {
	readonly discussCorpus: readonly HashedFile[];
	readonly target: TargetDefinition;
}
interface ReplayRunWorkspace {
	readonly directory: string;
	readonly paths: RecordedRun["paths"];
	readonly stateDir: string;
	readonly sourceRoot: string;
	readonly taskSha: string;
}
async function initializeRecordedRepository(sourceRoot: string): Promise<void> {
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
}
class RecordedReplayRunBuilder {
	readonly #options: RecordedReplayRunOptions;
	public constructor(options: Partial<RecordedReplayRunOptions> = {}) {
		this.#options = {
			discussCorpus: options.discussCorpus ?? [],
			target: options.target ?? TEST_TARGET,
		};
	}
	public async build(resources: DirectoryTracker): Promise<RecordedRun> {
		const workspace = await RecordedReplayRunBuilder.workspace(resources);
		const initial = await RecordedReplayRunBuilder.initialCheckpoint(workspace);
		const discuss = await this.discussCheckpoint(workspace, initial);
		const build = await RecordedReplayRunBuilder.buildCheckpoint(
			workspace,
			discuss,
		);
		const manifest = this.manifest(workspace);
		await writeRunManifest(workspace.paths.manifestFile, manifest);

		return { build, discuss, initial, manifest, paths: workspace.paths };
	}
	private static async workspace(
		resources: DirectoryTracker,
	): Promise<ReplayRunWorkspace> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-replayrun-"));
		resources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const stateDir = join(directory, "state");
		const sourceRoot = join(directory, "primary");
		await mkdir(sourceRoot);
		await initializeRecordedRepository(sourceRoot);
		const head = await runCommand(["git", "rev-parse", "HEAD"], sourceRoot);
		const taskSha = head.trim();

		return { directory, paths, sourceRoot, stateDir, taskSha };
	}

	private static async initialCheckpoint(
		workspace: ReplayRunWorkspace,
	): Promise<CheckpointRecord> {
		const { stateDir, paths, taskSha } = workspace;
		await mkdir(join(stateDir, "backlog", "docs"), { recursive: true });
		await Bun.write(join(stateDir, "backlog", "config.yml"), "statuses: []\n");
		return await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("initial"),
			{
				artifacts: [],
				corpusFiles: [],
				model: "sonnet",
				stage: "initial",
				targetSha: taskSha,
				upstream: "root-key",
			},
		);
	}
	private async discussCheckpoint(
		workspace: ReplayRunWorkspace,
		initial: Readonly<CheckpointRecord>,
	): Promise<CheckpointRecord> {
		const { stateDir, paths, taskSha } = workspace;
		const { discussCorpus } = this.#options;
		await Bun.write(join(stateDir, REPLAY_SPEC_PATH), REPLAY_SPEC_CONTENT);
		return await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("discuss"),
			{
				artifacts: [
					{
						path: REPLAY_SPEC_PATH,
						sha256: createHash("sha256")
							.update(REPLAY_SPEC_CONTENT)
							.digest("hex"),
					},
				],
				corpusFiles: discussCorpus,
				model: "sonnet",
				stage: "discuss",
				targetSha: taskSha,
				upstream: initial.lineage,
			},
		);
	}
	private static async buildCheckpoint(
		workspace: ReplayRunWorkspace,
		discuss: Readonly<CheckpointRecord>,
	): Promise<CheckpointRecord> {
		const { stateDir, paths, taskSha } = workspace;
		return await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("build"),
			{
				artifacts: [],
				corpusFiles: [
					{
						path: "skills/build/SKILL.md",
						sha256: createHash("sha256").update("build").digest("hex"),
					},
				],
				model: "sonnet",
				stage: "build",
				targetSha: taskSha,
				upstream: discuss.lineage,
			},
		);
	}
	private manifest({
		directory,
		sourceRoot,
		taskSha,
	}: ReplayRunWorkspace): RunManifest {
		return {
			caseId: "audit-log",
			controlSha: "run-control-sha",
			judgeModel: "sonnet",
			model: "sonnet",
			pipeline: this.pipeline(),
			pipelinePath: "pipelines/default.json",
			productBrief: "Brief text",
			sessionBudgetUsd: 5,
			sourceRoot,
			sourceSha: taskSha,
			targetRoot: join(directory, "target"),
			task: "Task text",
			taskId: "TASK-1",
			taskSha,
			timestamp: "2026-08-30T00:00:00.000Z",
		};
	}
	private pipeline(): RunManifest["pipeline"] {
		const { target } = this.#options;
		return {
			stages: [
				{
					artifact: "spec",
					kind: "planning",
					name: "discuss",
					requiresAcceptanceCriteria: false,
					rubric: "rubrics/discuss.json",
					skill: "discuss",
				},
				{
					kind: "delivery",
					name: "build",
					rubric: "rubrics/build.json",
					skill: "build",
				},
				{
					kind: "delivery",
					name: "review",
					rubric: "rubrics/review.json",
					skill: "review",
				},
			],
			statuses: ["To Do", "Done"],
			target,
		};
	}
}
export default RecordedReplayRunBuilder;
export type { RecordedRun, RecordedReplayRunOptions };
