import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CheckpointRecord, HashedFile } from "./checkpoint";
import { recordCheckpoint } from "./checkpoint";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { TargetDefinition } from "./pipeline";
import type { ReadManifestEntry } from "./read-manifest";
import { benchmarkRunPaths } from "./run-layout";
import { TEST_TARGET } from "./test-support";

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
const SPEC_CONTENT = "the spec\n";
const SPEC_PATH = "backlog/docs/DOC-1 - spec.md";
interface RecordedReplayRunOptions {
	readonly discussCorpus: readonly HashedFile[];
	readonly judgeRubricSha256: string | undefined;
	readonly target: TargetDefinition;
	readonly discussReads: readonly ReadManifestEntry[];
}
interface ReplayRunWorkspace {
	readonly directory: string;
	readonly paths: RecordedRun["paths"];
	readonly stateDir: string;
	readonly sourceRoot: string;
	readonly taskSha: string;
}
class ReplaySavedRunBuilder {
	readonly #options: RecordedReplayRunOptions;
	public constructor(options: Partial<RecordedReplayRunOptions> = {}) {
		const judgedCorpus: readonly HashedFile[] =
			options.judgeRubricSha256 === undefined
				? []
				: [
						{
							path: "skills/discuss/SKILL.md",
							sha256: createHash("sha256").update("discuss").digest("hex"),
						},
					];
		const judgeReads: readonly ReadManifestEntry[] =
			options.judgeRubricSha256 === undefined
				? []
				: [
						{
							evidence: "declared",
							half: "rubric",
							path: "cases/audit-log/rubrics/shape.json",
							role: "judge rubric",
							sha256: options.judgeRubricSha256,
						},
					];
		this.#options = {
			discussCorpus: options.discussCorpus ?? judgedCorpus,
			discussReads: options.discussReads ?? judgeReads,
			judgeRubricSha256: options.judgeRubricSha256,
			target: options.target ?? TEST_TARGET,
		};
	}
	public async build(resources: DirectoryTracker): Promise<RecordedRun> {
		const workspace = await ReplaySavedRunBuilder.workspace(resources);
		const initial = await ReplaySavedRunBuilder.initialCheckpoint(workspace);
		const discuss = await this.discussCheckpoint(workspace, initial);
		const build = await ReplaySavedRunBuilder.buildCheckpoint(
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
		const taskSha = "task-sha";

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
		const { discussCorpus, discussReads } = this.#options;
		await Bun.write(join(stateDir, SPEC_PATH), SPEC_CONTENT);
		return await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("discuss"),
			{
				artifacts: [
					{
						path: SPEC_PATH,
						sha256: createHash("sha256").update(SPEC_CONTENT).digest("hex"),
					},
				],
				corpusFiles: discussCorpus,
				model: "sonnet",
				readManifest: discussReads,
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
		const { stateDir, paths } = workspace;
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
				targetSha: "candidate-sha",
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
			sourceSha: "source-sha",
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

async function writeReplayCheckpointDirectory(
	resources: DirectoryTracker,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-run-"));
	resources.track(directory);
	const targetDir = join(directory, "target");
	await createReplayBoard(targetDir);
	const runDirectory = join(directory, "checkpoints");
	const base = {
		artifacts: [],
		corpusFiles: [],
		model: "sonnet",
		targetSha: "task-sha",
		upstream: "root-key",
	};
	await recordCheckpoint(targetDir, join(runDirectory, "initial"), {
		...base,
		stage: "initial",
	});
	await recordCheckpoint(targetDir, join(runDirectory, "discuss"), {
		...base,
		stage: "discuss",
	});
	await Bun.write(join(runDirectory, "manifest.json"), "{}\n");

	return runDirectory;
}

async function createReplayBoard(targetDir: string): Promise<void> {
	await mkdir(join(targetDir, "backlog"), { recursive: true });
	await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
}
export default ReplaySavedRunBuilder;
export type { RecordedRun, RecordedReplayRunOptions };

export { SPEC_CONTENT, SPEC_PATH, writeReplayCheckpointDirectory };
